import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Asset, VideoDocument, VideoLayer } from "../src/shared/types.js";
import { documentSchema } from "./store.js";
import { probeMediaFile, runHyperframes } from "./media.js";

const html = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
const fontFaces = `@font-face{font-family:Montserrat;src:url('assets/fonts/montserrat.ttf') format('truetype');font-weight:100 900;font-style:normal;font-display:block}@font-face{font-family:'Space Mono';src:url('assets/fonts/space-mono.ttf') format('truetype');font-weight:400;font-style:normal;font-display:block}@font-face{font-family:'Space Mono';src:url('assets/fonts/space-mono-bold.ttf') format('truetype');font-weight:600 900;font-style:normal;font-display:block}`;

async function directory(path: string) {
  await mkdir(path, { recursive: true });
  if ((await lstat(path)).isSymbolicLink())
    throw new Error("Composition directories cannot be symbolic links.");
}

async function writeSource(path: string, content: string) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Composition files cannot be symbolic links.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(path, content);
}

function mediaAsset(layer: VideoLayer, assets: Asset[]): Asset {
  const asset = assets.find(
    (asset) => asset.id === layer.assetId && asset.type === layer.type,
  );
  if (!asset)
    throw new Error(`Missing or incompatible asset for layer "${layer.name}".`);
  if (
    asset.filename !== basename(asset.filename) ||
    /[\\/\x00-\x1f]/.test(asset.filename) ||
    asset.filename === "." ||
    asset.filename === ".."
  )
    throw new Error("Invalid asset filename.");
  return asset;
}

function common(layer: VideoLayer): string {
  return `id="layer-${html(layer.id)}" class="clip layer" data-name="${html(layer.name)}" data-start="${layer.start}" data-duration="${layer.duration}" data-track-index="${layer.track}"${layer.hidden ? ' data-hidden="true"' : ""}${layer.locked ? ' data-locked="true"' : ""}`;
}

function layerHtml(layer: VideoLayer, assets: Asset[]): string {
  const position = `left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;transform:rotate(${layer.rotation}deg);opacity:${layer.opacity};z-index:${layer.track + 1};border-radius:${layer.borderRadius ?? 0}px;background:${layer.background ?? "transparent"};`;
  const timing = common(layer);
  const style = `style="${html(position)}" data-layout-allow-overlap data-layout-allow-overflow`;
  if (layer.type === "text")
    return `<div ${timing} ${style}><div class="text" style="font-size:${layer.fontSize ?? 64}px;font-family:${html(layer.fontFamily ?? "Montserrat")},sans-serif;font-weight:${layer.fontWeight ?? 600};color:${html(layer.color ?? "#ffffff")}"><span data-var-text="text-${html(layer.id)}">${html(layer.text ?? "")}</span></div></div>`;
  if (layer.type === "shape") return `<div ${timing} ${style}></div>`;
  const asset = mediaAsset(layer, assets);
  const src = `assets/${encodeURIComponent(asset.filename)}`;
  if (layer.type === "image")
    return `<img ${timing} ${style} src="${html(src)}" data-var-src="src-${html(layer.id)}" alt="${html(layer.name)}">`;
  const media = `src="${html(src)}" data-var-src="src-${html(layer.id)}" data-media-start="${layer.trimStart ?? 0}" data-volume="${layer.hidden ? 0 : (layer.volume ?? 1)}" data-fade-in="${layer.fadeIn ?? 0}" data-fade-out="${layer.fadeOut ?? 0}"`;
  if (layer.type === "audio") return `<audio ${timing} ${media}></audio>`;
  return `<video ${timing} ${style} ${media} playsinline data-has-audio="true"></video>`;
}

export async function compileComposition(
  projectDir: string,
  input: VideoDocument,
  assets: Asset[],
): Promise<{ directory: string; htmlPath: string }> {
  const document = documentSchema.parse(input);
  if (
    !(await lstat(projectDir)).isDirectory() ||
    (await lstat(projectDir)).isSymbolicLink()
  )
    throw new Error("Project must be a local directory.");
  const output = join(projectDir, "hyperframes");
  await directory(output);
  await directory(join(output, "assets"));
  await directory(join(output, "compositions"));
  await directory(join(output, "assets/fonts"));
  for (const filename of [
    "montserrat.ttf",
    "space-mono.ttf",
    "space-mono-bold.ttf",
    "Montserrat-OFL.txt",
    "SpaceMono-OFL.txt",
  ]) {
    const target = join(output, "assets/fonts", filename);
    try {
      if ((await lstat(target)).isSymbolicLink())
        throw new Error("Font outputs cannot be symbolic links.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await copyFile(
      fileURLToPath(new URL(`../public/fonts/${filename}`, import.meta.url)),
      target,
    );
  }
  const used = new Map<string, Asset>();
  for (const layer of document.layers) {
    if (["image", "video", "audio"].includes(layer.type)) {
      const asset = mediaAsset(layer, assets);
      used.set(asset.id, asset);
    }
  }
  for (const asset of used.values()) {
    if (!(await lstat(join(projectDir, "assets"))).isDirectory())
      throw new Error("Assets must be a local directory.");
    const source = join(projectDir, "assets", asset.filename);
    if (!(await lstat(source)).isFile())
      throw new Error(`Asset "${asset.name}" must be a regular local file.`);
    const target = join(output, "assets", asset.filename);
    try {
      if ((await lstat(target)).isSymbolicLink())
        throw new Error("Asset outputs cannot be symbolic links.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await copyFile(source, target);
  }
  const variables = document.layers.flatMap((layer) =>
    layer.type === "text"
      ? [
          {
            id: `text-${layer.id}`,
            type: "string",
            label: layer.name,
            default: layer.text ?? "",
          },
        ]
      : ["image", "video", "audio"].includes(layer.type)
        ? [
            {
              id: `src-${layer.id}`,
              type: "string",
              label: layer.name,
              default: `assets/${encodeURIComponent(mediaAsset(layer, assets).filename)}`,
            },
          ]
        : [],
  );
  const values = Object.fromEntries(
    variables.map((variable) => [variable.id, variable.default]),
  );
  const tweens = document.layers
    .filter((layer) => layer.type !== "audio")
    .flatMap((layer) => {
      const result: string[] = [];
      const fadeIn = layer.fadeIn ?? 0,
        fadeOut = layer.fadeOut ?? 0;
      if (!fadeIn && !fadeOut) return result;
      const points = [
        0,
        layer.duration,
        Math.min(fadeIn, layer.duration),
        Math.max(0, layer.duration - fadeOut),
      ];
      if (fadeIn && fadeOut && fadeIn + fadeOut > layer.duration)
        points.push((layer.duration * fadeIn) / (fadeIn + fadeOut));
      const times = [...new Set(points)].sort((a, b) => a - b);
      const opacity = (time: number) =>
        layer.opacity *
        Math.min(
          fadeIn ? time / fadeIn : 1,
          fadeOut ? (layer.duration - time) / fadeOut : 1,
          1,
        );
      for (let index = 1; index < times.length; index++) {
        const from = times[index - 1]!,
          to = times[index]!;
        if (opacity(from) !== opacity(to))
          result.push(
            `tl.fromTo("#layer-${layer.id}",{opacity:${opacity(from)}},{opacity:${opacity(to)},duration:${Number((to - from).toFixed(9))},ease:"none",immediateRender:false},${Number((layer.start + from).toFixed(9))});`,
          );
      }
      return result;
    });
  await writeSource(
    join(output, "compositions/main.html"),
    `<template>
  <style>
    ${fontFaces}
    #root { position:absolute;inset:0;overflow:hidden; }
    .layer { position:absolute;box-sizing:border-box;transform-origin:center;object-fit:contain;overflow:hidden; }
    .text { width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-wrap;overflow-wrap:break-word;line-height:1.08; }
    .text>span { flex-shrink:0;width:100%; }
  </style>
  <div id="root" data-composition-id="main" data-width="${document.width}" data-height="${document.height}" data-composition-variables="${html(json(variables))}">
    <div style="position:absolute;inset:0;background:${html(document.background)}" data-layout-ignore></div>
    ${document.layers.map((layer) => layerHtml(layer, assets)).join("\n    ")}
  </div>
  <script>
    const tl = gsap.timeline({paused:true});
    tl.to({}, {duration:${document.duration}});
    ${tweens.join("\n    ")}
    window.__timelines["main"] = tl;
  </script>
</template>
`,
  );
  const index = `<!doctype html>
<html lang="en" data-composition-variables="${html(json(variables))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${document.width},height=${document.height}">
  <title>short.it composition</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>${fontFaces}html,body{margin:0;width:${document.width}px;height:${document.height}px;overflow:hidden;background:${html(document.background)}}#root{position:absolute;inset:0}</style>
</head>
<body>
  <div id="root" data-composition-id="root" data-start="0" data-duration="${document.duration}" data-width="${document.width}" data-height="${document.height}" data-fps="${document.fps}">
    <div id="main" class="clip" data-composition-id="main" data-composition-src="compositions/main.html" data-start="0" data-duration="${document.duration}" data-width="${document.width}" data-height="${document.height}" data-track-index="0" data-track-kind="graphics" data-variable-values="${html(json(values))}"></div>
  </div>
  <script>const tl=gsap.timeline({paused:true});tl.to({},{duration:${document.duration}});window.__timelines=window.__timelines||{};window.__timelines["root"]=tl;</script>
</body>
</html>
`;
  const htmlPath = join(output, "index.html");
  await writeSource(htmlPath, index);
  await writeSource(
    join(output, "document.json"),
    JSON.stringify(document, null, 2),
  );
  await writeSource(
    join(output, "hyperframes.json"),
    JSON.stringify(
      {
        $schema: "https://hyperframes.heygen.com/schema.json",
        fps: document.fps,
      },
      null,
      2,
    ),
  );
  return { directory: output, htmlPath };
}

export async function renderComposition(
  projectDir: string,
  document: VideoDocument,
  assets: Asset[],
  onProgress?: (message: string) => void,
): Promise<{ filename: string; path: string }> {
  onProgress?.("Compiling editable HyperFrames composition…");
  const composition = await compileComposition(projectDir, document, assets);
  const exportsDirectory = join(projectDir, "exports");
  await directory(exportsDirectory);
  const filename = `${randomUUID()}.mp4`;
  const path = join(exportsDirectory, filename);
  const logs: string[] = [];
  const progress = (text: string) => {
    logs.push(text);
    if (logs.length > 1000) logs.shift();
    const message = text
      .replace(/\x1b\[[0-9;]*m/g, "")
      .trim()
      .split(/[\r\n]/)
      .filter(Boolean)
      .at(-1);
    if (message) onProgress?.(message.slice(0, 500));
  };
  try {
    onProgress?.("Checking HyperFrames composition structure…");
    await runHyperframes(["lint", "--json"], {
      cwd: composition.directory,
      timeoutMs: 120_000,
      onOutput: progress,
    });
    onProgress?.(
      "Rendering MP4 with HyperFrames… First use may download the CLI and browser.",
    );
    await runHyperframes(
      [
        "render",
        "--output",
        path,
        "--fps",
        String(document.fps),
        "--quality",
        "looks",
      ],
      {
        cwd: composition.directory,
        timeoutMs: 2 * 60 * 60_000,
        onOutput: progress,
      },
    );
    if (!(await stat(path)).size)
      throw new Error("HyperFrames produced an empty export.");
    const info = await probeMediaFile(path);
    if (
      !info.hasVideo ||
      Math.abs(info.duration - document.duration) >
        Math.max(0.15, 2 / document.fps)
    )
      throw new Error(
        `Export duration mismatch: expected ${document.duration}s, received ${info.duration}s.`,
      );
    onProgress?.("MP4 ready.");
    return { filename, path };
  } finally {
    await writeFile(
      join(exportsDirectory, `${filename}.log`),
      logs.join("").slice(-128_000),
    );
  }
}
