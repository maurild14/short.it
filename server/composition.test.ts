import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileComposition } from "./composition.js";
import type { Asset, VideoDocument, VideoLayer } from "../src/shared/types.js";

const layer = (patch: Partial<VideoLayer> = {}): VideoLayer => ({
  id: "title",
  name: "Title",
  type: "text",
  start: 1,
  duration: 2,
  track: 2,
  x: 10,
  y: 20,
  width: 200,
  height: 100,
  rotation: 15,
  opacity: 0.8,
  text: "Hello",
  fontFamily: "Inter",
  ...patch,
});
const doc = (layers: VideoLayer[]): VideoDocument => ({
  version: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 5,
  background: "#08090b",
  layers,
});

test("compiler preserves editable geometry, timing, fades and safely escapes user text", async () => {
  const project = await mkdtemp(join(tmpdir(), "short-it-composition-"));
  try {
    const result = await compileComposition(
      project,
      doc([
        layer({
          text: '</script><img src=x onerror="alert(1)"> & title',
          fadeIn: 0.2,
          fadeOut: 0.3,
        }),
      ]),
      [],
    );
    const root = await readFile(result.htmlPath, "utf8");
    const scene = await readFile(
      join(result.directory, "compositions/main.html"),
      "utf8",
    );
    assert.match(
      root,
      /data-duration="5"[^>]*data-width="1080"[^>]*data-height="1920"[^>]*data-fps="30"/,
    );
    assert.match(root, /data-composition-src="compositions\/main.html"/);
    assert.match(
      scene,
      /id="layer-title"[^>]*data-start="1" data-duration="2" data-track-index="2"/,
    );
    assert.match(
      scene,
      /left:10px;top:20px;width:200px;height:100px;transform:rotate\(15deg\);opacity:0.8;z-index:3/,
    );
    assert.match(
      scene,
      /&lt;\/script&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; title/,
    );
    assert.doesNotMatch(scene, /<img src=x/);
    assert.match(scene, /duration:0.2[^\n]*,1\)/);
    assert.match(scene, /duration:0.3[^\n]*,2.7\)/);
    assert.match(scene, /window\.__timelines\["main"\]/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("compiler copies media and retains audio IDs, trims, volume and hidden state", async () => {
  const project = await mkdtemp(join(tmpdir(), "short-it-media-"));
  const asset: Asset = {
    id: "sound",
    name: "Music",
    filename: "sound.wav",
    type: "audio",
    mime: "audio/wav",
    size: 7,
  };
  try {
    await mkdir(join(project, "assets"));
    await writeFile(join(project, "assets/sound.wav"), "fixture");
    const result = await compileComposition(
      project,
      doc([
        layer({
          id: "music",
          type: "audio",
          assetId: "sound",
          trimStart: 4,
          volume: 0.4,
          hidden: true,
          fadeIn: 0.1,
        }),
      ]),
      [asset],
    );
    assert.equal(
      await readFile(join(result.directory, "assets/sound.wav"), "utf8"),
      "fixture",
    );
    const scene = await readFile(
      join(result.directory, "compositions/main.html"),
      "utf8",
    );
    assert.match(
      scene,
      /<audio id="layer-music"[^>]*data-hidden="true"[^>]*src="assets\/sound.wav"[^>]*data-media-start="4" data-volume="0" data-fade-in="0.1"/,
    );
    await assert.rejects(
      compileComposition(
        project,
        doc([layer({ type: "image", assetId: "sound" })]),
        [asset],
      ),
      /Missing or incompatible asset/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("compiler rejects invalid timings, asset traversal and output directory links", async () => {
  const project = await mkdtemp(join(tmpdir(), "short-it-unsafe-"));
  try {
    await assert.rejects(
      compileComposition(project, doc([layer({ duration: 20 })]), []),
      /Layer extends beyond/,
    );
    await assert.rejects(
      compileComposition(
        project,
        doc([layer({ type: "image", assetId: "unsafe" })]),
        [
          {
            id: "unsafe",
            name: "Unsafe",
            filename: "../outside.png",
            type: "image",
            mime: "image/png",
            size: 1,
          },
        ],
      ),
      /Invalid asset filename/,
    );
    await rm(join(project, "hyperframes"), { recursive: true, force: true });
    await mkdir(join(project, "outside"));
    await symlink(
      join(project, "outside"),
      join(project, "hyperframes"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      compileComposition(project, doc([]), []),
      /symbolic links/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("overlapping fades use the same opacity intersection as the editor", async () => {
  const project = await mkdtemp(join(tmpdir(), "short-it-fade-"));
  try {
    const result = await compileComposition(
      project,
      doc([
        layer({ start: 0, duration: 1, opacity: 1, fadeIn: 1, fadeOut: 1 }),
      ]),
      [],
    );
    const scene = await readFile(
      join(result.directory, "compositions/main.html"),
      "utf8",
    );
    assert.match(scene, /\{opacity:0\},\{opacity:0.5,duration:0.5/);
    assert.match(scene, /\{opacity:0.5\},\{opacity:0,duration:0.5/);
    assert.match(scene, /assets\/fonts\/montserrat.ttf/);
    assert.ok(
      (await readFile(join(result.directory, "assets/fonts/montserrat.ttf")))
        .length > 1000,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
