import { spawn, type ChildProcess } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reference } from "../src/shared/types.js";

const HYPERFRAMES_VERSION = "0.9.41";
const installHints: Record<string, string> = {
  "yt-dlp":
    "Install yt-dlp: python -m pip install -U yt-dlp, then add its Scripts directory to PATH.",
  ffmpeg:
    "Install FFmpeg and add its bin directory to PATH (Windows: winget install Gyan.FFmpeg).",
  ffprobe:
    "Install FFmpeg, which includes ffprobe, and add its bin directory to PATH.",
  whisper:
    "For videos without captions, install local transcription: python -m pip install -U openai-whisper. Its first run downloads the base model.",
};
const fasterWhisperHint =
  "Alternative local transcription: python -m pip install -U faster-whisper. Its first use downloads the base model.";

export async function findExecutable(
  name: string,
): Promise<string | undefined> {
  const suffixes = process.platform === "win32" ? [".exe", ".com", ""] : [""];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const suffix of suffixes) {
      const candidate = resolve(directory.replace(/^"|"$/g, ""), name + suffix);
      try {
        await access(
          candidate,
          process.platform === "win32" ? constants.F_OK : constants.X_OK,
        );
        return candidate;
      } catch {
        /* Try the next PATH entry. */
      }
    }
  }
  return undefined;
}

export async function probeMediaDependencies() {
  const dependencies = await Promise.all(
    Object.keys(installHints).map(async (name) => ({
      name,
      available: Boolean(await findExecutable(name)),
      hint: installHints[name]!,
    })),
  );
  dependencies.push({
    name: "faster-whisper",
    available: Boolean(await fasterWhisperPython()),
    hint: fasterWhisperHint,
  });
  return dependencies;
}

async function fasterWhisperPython(): Promise<string | undefined> {
  for (const name of ["python", "python3"]) {
    const python = await findExecutable(name);
    if (!python) continue;
    try {
      const result = await runCommand(
        python,
        [
          "-c",
          'import importlib.util; print("yes" if importlib.util.find_spec("faster_whisper") else "no")',
        ],
        { timeoutMs: 10_000 },
      );
      if (result.stdout.trim() === "yes") return python;
    } catch {
      /* Another Python installation or the Whisper CLI may be available. */
    }
  }
  return undefined;
}

function terminateProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn(
      join(process.env.SystemRoot ?? "C:\\Windows", "System32/taskkill.exe"),
      ["/pid", String(child.pid), "/t", "/f"],
      { shell: false, windowsHide: true, stdio: "ignore" },
    ).once("error", () => child.kill());
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    onOutput?: (text: string) => void;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "",
      stderr = "",
      timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, options.timeoutMs ?? 120_000);
    const collect = (kind: "stdout" | "stderr", value: string) => {
      // Bound memory while retaining enough JSON metadata and the useful tail of diagnostics.
      if (kind === "stdout") stdout = (stdout + value).slice(-16_000_000);
      else stderr = (stderr + value).slice(-128_000);
      options.onOutput?.(value);
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.once("error", (error) => {
      clearTimeout(timeout);
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      reject(
        new Error(
          missing
            ? `${command} was not found. ${installHints[command] ?? "Install the executable and add it to PATH."}`
            : `Cannot start ${command}: ${error.message}`,
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut)
        reject(
          new Error(
            `${command} timed out. Partial files were retained; retry the job.`,
          ),
        );
      else if (code !== 0)
        reject(
          new Error(
            `${command} exited with code ${code ?? "unknown"}: ${(stderr || stdout).trim().slice(-5000) || "No diagnostic output."}`,
          ),
        );
      else resolveCommand({ stdout, stderr });
    });
  });
}

export async function runHyperframes(
  args: string[],
  options: Parameters<typeof runCommand>[2] = {},
) {
  const localCli = fileURLToPath(
    new URL("../node_modules/hyperframes/bin/hyperframes.mjs", import.meta.url),
  );
  try {
    await access(localCli);
    return runCommand(process.execPath, [localCli, ...args], options);
  } catch {
    /* Use the pinned CLI through npm. */
  }
  if (process.platform !== "win32")
    return runCommand(
      "npx",
      ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args],
      options,
    );
  // npm's JavaScript entry point avoids cmd.exe and its URL/path interpolation rules.
  const candidates = [
    join(dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"),
    ...(process.env.npm_execpath
      ? [join(dirname(process.env.npm_execpath), "npx-cli.js")]
      : []),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return runCommand(
        process.execPath,
        [candidate, "--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args],
        options,
      );
    } catch {
      /* Try the next npm installation. */
    }
  }
  throw new Error(
    "npm/npx was not found. Install Node.js 22.18+ with npm, then restart short.it.",
  );
}

export function validateReferenceUrl(input: string): {
  url: string;
  platform: string;
} {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a complete HTTPS video URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error(
      "References must use HTTPS without credentials or a custom port.",
    );
  const host = url.hostname.toLowerCase();
  let platform: string;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    platform = "YouTube";
    const id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id))
      throw new Error(
        "Use a YouTube video or Shorts URL, not a channel or playlist.",
      );
    url = new URL(`https://www.youtube.com/watch?v=${id}`);
  } else if (host === "youtu.be") {
    platform = "YouTube";
    const id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
    if (!id) throw new Error("Use a valid youtu.be video URL.");
    url = new URL(`https://www.youtube.com/watch?v=${id}`);
  } else if (["instagram.com", "www.instagram.com"].includes(host)) {
    platform = "Instagram";
    if (!/^\/(?:reel|reels|p)\/[\w-]+\/?$/.test(url.pathname))
      throw new Error("Use an Instagram Reel or video post URL.");
    url.search = "";
  } else if (["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host)) {
    platform = "TikTok";
    if (!/^\/@[\w.-]+\/video\/\d+\/?$/.test(url.pathname))
      throw new Error("Use a TikTok video URL.");
    url.search = "";
  } else if (["vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
    platform = "TikTok";
    if (!/^\/[a-zA-Z\d]+\/?$/.test(url.pathname))
      throw new Error("Use a valid TikTok share URL.");
    url.search = "";
  } else
    throw new Error(
      "Supported references: YouTube, Shorts, Instagram Reels and TikTok.",
    );
  url.hash = "";
  return { url: url.toString(), platform };
}

export function transcriptFromVtt(source: string): string {
  const lines: string[] = [];
  let previous = "";
  for (const block of source.replace(/\r/g, "").split(/\n\s*\n/)) {
    const cue = block.split("\n");
    const timestamp = cue.findIndex((line) =>
      /^\s*(?:\d+:)?\d{2}:\d{2}[.,]\d{3}\s*-->/.test(line),
    );
    if (timestamp < 0) continue;
    for (const line of cue.slice(timestamp + 1)) {
      const text = line
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .trim();
      if (!text || text === previous) continue;
      lines.push(text);
      previous = text;
    }
  }
  return lines.join("\n");
}

function referenceDirectory(projectDir: string, id: string): string {
  if (!/^[a-zA-Z\d_-]{1,100}$/.test(id))
    throw new Error("Invalid reference id.");
  return join(projectDir, "transcripciones", id);
}

async function localDirectory(path: string) {
  await mkdir(path, { recursive: true });
  if (!(await lstat(path)).isDirectory())
    throw new Error(
      "Reference directories must be local directories without symbolic links.",
    );
}

async function writeLocalFile(path: string, text: string) {
  try {
    if (!(await lstat(path)).isFile())
      throw new Error(
        "Reference files must be local regular files without symbolic links.",
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(path, text);
}

async function rejectLinks(directory: string) {
  if (
    (await readdir(directory, { withFileTypes: true })).some((entry) =>
      entry.isSymbolicLink(),
    )
  )
    throw new Error("Reference directories cannot contain symbolic links.");
}

export async function probeMediaFile(path: string) {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    path,
  ]);
  const info = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: {
      codec_type: string;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      duration?: string;
    }[];
  };
  const video = info.streams?.find((stream) => stream.codec_type === "video");
  const [numerator, denominator = 1] = (
    video?.avg_frame_rate ||
    video?.r_frame_rate ||
    "0/1"
  )
    .split("/")
    .map(Number);
  return {
    duration: Number(info.format?.duration ?? video?.duration ?? 0),
    fps: numerator! / (denominator || 1),
    hasAudio: Boolean(
      info.streams?.some((stream) => stream.codec_type === "audio"),
    ),
    hasVideo: Boolean(video),
  };
}

export async function processReference(
  projectDir: string,
  reference: Reference,
  onUpdate: (patch: Partial<Reference>) => Promise<void> | void,
): Promise<void> {
  const validated = validateReferenceUrl(reference.url);
  const directory = referenceDirectory(projectDir, reference.id);
  if (!(await lstat(projectDir)).isDirectory())
    throw new Error("Project must be a local directory.");
  await localDirectory(join(projectDir, "transcripciones"));
  await localDirectory(directory);
  await rejectLinks(directory);
  const update = async (patch: Partial<Reference>) => {
    Object.assign(reference, patch);
    await writeLocalFile(
      join(directory, "status.json"),
      JSON.stringify(reference, null, 2),
    );
    await onUpdate(patch);
  };
  const logs: string[] = [];
  const log = (text: string) => {
    logs.push(text);
    if (logs.length > 1000) logs.shift();
  };
  try {
    await update({ status: "downloading", error: undefined, ...validated });
    let source = (await readdir(directory)).find((name) =>
      /^source\.(mp4|webm|mkv|mov|m4v)$/.test(name),
    );
    if (!source) {
      await runCommand(
        "yt-dlp",
        [
          "--ignore-config",
          "--no-playlist",
          "--no-progress",
          "--retries",
          "3",
          "--fragment-retries",
          "3",
          "--retry-sleep",
          "2",
          "--socket-timeout",
          "30",
          "--use-extractors",
          "youtube.*,instagram.*,tiktok.*",
          "--write-info-json",
          "--write-subs",
          "--write-auto-subs",
          "--sub-langs",
          "es,en,.*-orig",
          "--sub-format",
          "vtt",
          "--format",
          "bv*+ba/b",
          "--merge-output-format",
          "mp4",
          "--output",
          join(directory, "source.%(ext)s"),
          "--",
          validated.url,
        ],
        { timeoutMs: 30 * 60_000, onOutput: log },
      );
      source = (await readdir(directory)).find((name) =>
        /^source\.(mp4|webm|mkv|mov|m4v)$/.test(name),
      );
    }
    if (!source)
      throw new Error(
        "The downloader did not produce a video. The post may require a login or may no longer be public.",
      );
    const sourcePath = join(directory, source);
    if (!(await lstat(sourcePath)).isFile())
      throw new Error("The reference source must be a regular local file.");
    const info = await probeMediaFile(sourcePath);
    if (!info.hasVideo || !Number.isFinite(info.duration) || info.duration <= 0)
      throw new Error("The downloaded file has no readable video stream.");
    await update({
      status: "extracting",
      duration: info.duration,
      fps: info.fps,
    });
    const frames = join(directory, "frames");
    await localDirectory(frames);
    await rejectLinks(frames);
    const completePath = join(directory, "frames.complete.json");
    let complete = false;
    try {
      const marker = JSON.parse(await readFile(completePath, "utf8"));
      const savedFrames = (await readdir(frames)).filter((name) =>
        /^frame-\d{8}\.jpg$/.test(name),
      );
      complete =
        marker.sourceSize === (await stat(sourcePath)).size &&
        marker.frameCount === savedFrames.length;
    } catch {
      /* Resume an interrupted extraction. */
    }
    if (!complete) {
      // No fps filter, scaling, frame cap, or sampling: one JPEG for every decoded source frame.
      await runCommand(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-y",
          "-i",
          sourcePath,
          "-map",
          "0:v:0",
          "-fps_mode",
          "passthrough",
          "-q:v",
          "3",
          join(frames, "frame-%08d.jpg"),
        ],
        { timeoutMs: 60 * 60_000, onOutput: log },
      );
    }
    const frameCount = (await readdir(frames)).filter((name) =>
      /^frame-\d{8}\.jpg$/.test(name),
    ).length;
    if (!frameCount) throw new Error("FFmpeg did not extract any frames.");
    await writeLocalFile(
      completePath,
      JSON.stringify(
        {
          sourceSize: (await stat(sourcePath)).size,
          frameCount,
          duration: info.duration,
          fps: info.fps,
        },
        null,
        2,
      ),
    );
    await update({ status: "transcribing", frameCount });
    let transcript = "";
    let transcriptSource = "";
    const captionFiles = (await readdir(directory))
      .filter((name) => name.endsWith(".vtt"))
      .sort((a, b) => Number(!a.includes(".es")) - Number(!b.includes(".es")));
    for (const name of captionFiles) {
      transcript = transcriptFromVtt(
        await readFile(join(directory, name), "utf8"),
      );
      if (transcript) {
        transcriptSource = name;
        break;
      }
    }
    if (!transcript) {
      if (!info.hasAudio)
        throw new Error(
          "All frames were saved, but this video has no audio track or captions to transcribe.",
        );
      const python = await fasterWhisperPython();
      if (python) {
        await runCommand(
          python,
          [
            fileURLToPath(new URL("../scripts/transcribe.py", import.meta.url)),
            sourcePath,
            "--output",
            join(directory, "transcript.txt"),
          ],
          { timeoutMs: 60 * 60_000, onOutput: log },
        );
        transcript = (
          await readFile(join(directory, "transcript.txt"), "utf8")
        ).trim();
        transcriptSource = "local-faster-whisper-base";
      } else if (await findExecutable("whisper")) {
        await runCommand(
          "whisper",
          [
            sourcePath,
            "--model",
            "base",
            "--task",
            "transcribe",
            "--output_format",
            "txt",
            "--output_dir",
            directory,
            "--fp16",
            "False",
            "--verbose",
            "False",
          ],
          { timeoutMs: 60 * 60_000, onOutput: log },
        );
        transcript = (
          await readFile(join(directory, "source.txt"), "utf8")
        ).trim();
        transcriptSource = "local-whisper-base";
      } else
        throw new Error(
          `All ${frameCount} frames were saved, but captions are unavailable. ${fasterWhisperHint} Then retry this reference; saved frames will be reused.`,
        );
      if (!transcript)
        throw new Error(
          "All frames were saved, but local Whisper found no speech. No transcript was fabricated.",
        );
    }
    await writeLocalFile(join(directory, "transcript.txt"), transcript + "\n");
    await writeLocalFile(
      join(directory, "manifest.json"),
      JSON.stringify(
        {
          url: validated.url,
          platform: validated.platform,
          source,
          frames: "frames/frame-%08d.jpg",
          frameCount,
          duration: info.duration,
          fps: info.fps,
          transcript: "transcript.txt",
          transcriptSource,
        },
        null,
        2,
      ),
    );
    await update({
      status: "ready",
      transcript,
      transcriptStatus: "available",
      error: undefined,
    });
  } catch (error) {
    await update({
      status: "error",
      transcriptStatus: reference.transcript ? "available" : "unavailable",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await writeLocalFile(
      join(directory, "process.log"),
      logs.join("").slice(-128_000),
    );
  }
}
