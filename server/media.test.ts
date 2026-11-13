import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  transcriptFromVtt,
  validateReferenceUrl,
  runCommand,
  findExecutable,
  processReference,
} from "./media.js";
import type { Reference } from "../src/shared/types.js";

test("reference URLs accept individual public platform videos and remove tracking", () => {
  assert.deepEqual(
    validateReferenceUrl("https://youtu.be/dQw4w9WgXcQ?si=tracking"),
    { platform: "YouTube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  );
  assert.equal(
    validateReferenceUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ").platform,
    "YouTube",
  );
  assert.equal(
    validateReferenceUrl(
      "https://www.instagram.com/reel/Abc_123/?utm_source=share",
    ).url,
    "https://www.instagram.com/reel/Abc_123/",
  );
  assert.equal(
    validateReferenceUrl("https://www.tiktok.com/@creator/video/123456789")
      .platform,
    "TikTok",
  );
  assert.equal(
    validateReferenceUrl("https://vm.tiktok.com/ZMabc123/").platform,
    "TikTok",
  );
});

test("reference URLs reject internal addresses, deceptive hosts, credentials and non-video pages", () => {
  for (const url of [
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://127.0.0.1/video",
    "https://[::1]/video",
    "file:///etc/passwd",
    "https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com@127.0.0.1/watch?v=dQw4w9WgXcQ",
    "https://user:password@youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com:444/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=abc",
    "https://www.instagram.com/creator/",
    "https://tiktok.com/@creator",
  ])
    assert.throws(() => validateReferenceUrl(url), Error, url);
});

test("VTT parsing keeps spoken text, strips timing and collapses rolling caption duplicates", () => {
  assert.equal(
    transcriptFromVtt(
      "WEBVTT\nKind: captions\n\n1\n00:00:00.000 --> 00:00:01.000\n<v Speaker>Hello &amp; welcome</v>\n\n2\n00:00:01.000 --> 00:00:02.000\nHello &amp; welcome\n<00:00:01.200>Next line\n",
    ),
    "Hello & welcome\nNext line",
  );
  assert.equal(transcriptFromVtt("WEBVTT\n\nNOTE metadata only\n"), "");
});

test("subprocess passes arguments literally and reports failures instead of swallowing them", async () => {
  const literal = 'a; $(command) & "quoted" camión → Ω';
  const result = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write(process.argv[1])",
    literal,
  ]);
  assert.equal(result.stdout, literal);
  await assert.rejects(
    runCommand(process.execPath, [
      "-e",
      'console.error("fixture failure");process.exit(7)',
    ]),
    /code 7: fixture failure/,
  );
  await assert.rejects(
    runCommand("short-it-not-a-real-command", []),
    /was not found/,
  );
});

test("a timed-out command also terminates its descendant process", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "short-it-timeout-"));
  const pidFile = join(temporary, "child.pid");
  let descendant: number | undefined;
  try {
    const fixture = `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});writeFileSync(process.argv[1],String(child.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
    const started = performance.now();
    await assert.rejects(
      runCommand(process.execPath, ["-e", fixture, pidFile], {
        timeoutMs: 1000,
      }),
      /timed out/,
    );
    assert.ok(performance.now() - started < 6000, "Timeout returns promptly");
    descendant = Number(await readFile(pidFile, "utf8"));
    let alive = true;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        process.kill(descendant, 0);
      } catch {
        alive = false;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(
      alive,
      false,
      "Descendant must not keep running after its parent times out",
    );
  } finally {
    if (descendant) {
      try {
        process.kill(descendant, "SIGKILL");
      } catch {
        /* Already stopped. */
      }
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

test("reference pipeline extracts every real video frame and saves the real caption text", async (t) => {
  if (!(await findExecutable("ffmpeg")) || !(await findExecutable("ffprobe"))) {
    t.skip("FFmpeg is not installed");
    return;
  }
  const project = await mkdtemp(join(tmpdir(), "short-it-reference-"));
  const directory = join(project, "transcripciones/ref");
  const reference: Reference = {
    id: "ref",
    url: "https://youtu.be/dQw4w9WgXcQ",
    platform: "YouTube",
    status: "queued",
  };
  const states: string[] = [];
  try {
    await mkdir(directory, { recursive: true });
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=64x64:r=6:d=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      join(directory, "source.mp4"),
    ]);
    await writeFile(
      join(directory, "source.en.vtt"),
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA real fixture caption.\n",
    );
    await processReference(project, reference, (patch) => {
      if (patch.status) states.push(patch.status);
    });
    assert.deepEqual(states, [
      "downloading",
      "extracting",
      "transcribing",
      "ready",
    ]);
    assert.equal(reference.frameCount, 6);
    assert.equal((await readdir(join(directory, "frames"))).length, 6);
    assert.equal(
      await readFile(join(directory, "transcript.txt"), "utf8"),
      "A real fixture caption.\n",
    );
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.transcriptSource, "source.en.vtt");
    await rm(join(directory, "frames/frame-00000003.jpg"));
    await processReference(project, reference, () => {});
    assert.equal(
      (await readdir(join(directory, "frames"))).length,
      6,
      "Retry restores a missing frame instead of trusting an incomplete cache",
    );
    const silentDirectory = join(project, "transcripciones/silent");
    await mkdir(silentDirectory);
    await copyFile(
      join(directory, "source.mp4"),
      join(silentDirectory, "source.mp4"),
    );
    const silent: Reference = {
      id: "silent",
      url: reference.url,
      platform: "YouTube",
      status: "queued",
    };
    await assert.rejects(
      processReference(project, silent, () => {}),
      /no audio track or captions/,
    );
    assert.equal(silent.status, "error");
    assert.equal(silent.transcriptStatus, "unavailable");
    assert.equal(
      silent.frameCount,
      6,
      "Failed transcription preserves the extracted frames",
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Python transcription wrapper writes timed segments with the requested local model", async (t) => {
  const python =
    (await findExecutable("python")) ?? (await findExecutable("python3"));
  if (!python) {
    t.skip("Python is not installed");
    return;
  }
  const temporary = await mkdtemp(join(tmpdir(), "short-it-transcription-"));
  const source = join(temporary, "source.mp4"),
    output = join(temporary, "transcript.txt");
  try {
    await writeFile(source, "fixture");
    const fixture = `import runpy, sys, types
class Model:
    def __init__(self, model, **options):
        assert model == 'base' and options == {'device': 'cpu', 'compute_type': 'int8'}
    def transcribe(self, source, **options):
        assert options == {'beam_size': 5, 'vad_filter': True}
        return iter([types.SimpleNamespace(start=0, end=1, text=' Fixture speech. ')]), types.SimpleNamespace(language='en', duration=1)
sys.modules['faster_whisper'] = types.SimpleNamespace(WhisperModel=Model)
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')`;
    await runCommand(python, [
      "-c",
      fixture,
      fileURLToPath(new URL("../scripts/transcribe.py", import.meta.url)),
      source,
      "--output",
      output,
    ]);
    assert.equal((await readFile(output, "utf8")).trim(), "Fixture speech.");
    const metadata = JSON.parse(
      await readFile(join(temporary, "transcript.json"), "utf8"),
    );
    assert.deepEqual(metadata.segments, [
      { start: 0, end: 1, text: "Fixture speech." },
    ]);
    assert.equal(metadata.language, "en");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
