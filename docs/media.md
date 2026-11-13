# Media references and video exports

short.it runs media tools locally. Uploads remain in each project's `assets/` folder. References accept up to five individual HTTPS YouTube videos/Shorts, Instagram Reels/video posts, or TikTok videos. Channels, playlists, arbitrary websites, credentials in URLs, and custom ports are rejected.

## Install the tools

Use Node.js 22.18+ with npm, plus `yt-dlp`, `ffmpeg` and `ffprobe` on PATH. On Windows, `winget install Gyan.FFmpeg` installs FFmpeg; `python -m pip install -U yt-dlp` installs the downloader. Restart the app after changing PATH. The health endpoint reports missing tools and installation hints.

For local transcription when platform captions are unavailable, install `python -m pip install -U faster-whisper` (CPU int8). The standard `python -m pip install -U openai-whisper` CLI is also supported. Only one local transcription backend is needed; diagnostics report each separately. The first use downloads the `base` model, and transcription runs on your computer. No speech API key is required. A missing backend, failed transcription, or video without speech produces an explicit reference error while retaining downloaded video and frames. Install the missing tool and retry the reference.

Public-platform availability depends on the platform. Private posts, authentication challenges, deleted posts, and blocked downloads can fail. short.it reports the downloader's error and does not import browser cookies automatically.

## What reference processing saves

Each reference has its own directory:

```text
transcripciones/<reference-id>/
  source.mp4                 # Original download; extension may differ
  source.info.json           # Platform metadata
  source.<language>.vtt      # Captions when available
  frames/frame-00000001.jpg  # Every decoded video frame, sequentially
  frames.complete.json      # Completed extraction marker
  transcript.txt            # Platform captions or actual local Whisper output
  transcript.json           # Timed segments when faster-whisper is used
  manifest.json             # Duration, fps, frame count and transcript source
  status.json
  process.log
```

Frame extraction is exhaustive: it has no sampling interval, frame cap, or resize filter. A 60-second 30 fps video creates approximately 1,800 full-resolution JPEGs; five long or high-resolution references can consume substantial disk space. Variable-frame-rate sources produce one image per decoded frame, so frame count need not equal duration multiplied by average fps.

Jobs expose `queued`, `downloading`, `extracting`, `transcribing`, `ready`, and `error` reference states. Downloads retry three times, with separate fragment retries. A successful reference needs both extracted frames and a real transcript. Failed jobs preserve partial results and diagnostic logs; retry reuses an existing downloaded source and completed frame extraction. Caption text is never invented to make a job appear successful.

## Editable HyperFrames output

The saved `document.json` is the editor's source of truth. Export compiles its independent text, image, shape, video and audio layers into:

```text
hyperframes/
  index.html
  compositions/main.html
  assets/<uploaded-file>
  document.json
  hyperframes.json
exports/<export-id>.mp4
exports/<export-id>.mp4.log
```

The HTML uses actual HyperFrames clips, stable layer IDs, tracks, per-layer positions/sizes, rotation, opacity, text/source variables, media trims, volume and edge fades. Layers remain editable source elements. Video keeps its own audio; separate audio layers are timed `<audio>` elements with IDs. Text and asset paths are escaped, and asset/output paths reject traversal and symbolic links.

The app uses HyperFrames **0.9.41** through npm when no project-local installation exists. First export may download the CLI and its browser. The standard GSAP script follows the official HyperFrames scaffold; the first compile may need network access to populate its caches. Montserrat and Space Mono are included locally with their Open Font Licenses and copied into the composition, matching the editor preview. The actual export commands, run inside the generated `hyperframes/` directory, are:

```sh
npx --yes hyperframes@0.9.41 lint --json
npx --yes hyperframes@0.9.41 render --output ../exports/final.mp4 --fps 30 --quality looks
```

The app checks subprocess exit codes, nonempty output and the MP4's probed duration. Rendering errors stay visible in the job and its log. Structural lint runs automatically. For the complete browser-based layout, media and contrast audit, run `npx --yes hyperframes@0.9.41 check --json`; deliberate layer overlap or still compositions may need review. Open the generated project in the HyperFrames desktop app or run `npx --yes hyperframes@0.9.41 preview` to keep editing there.

The document's FPS is passed to the real render command; the shown `30` is an example. Clips that overlap are painted by track order. Visual fade curves match the editor preview, including intersecting fades on short clips.

Primary references: [HyperFrames rendering guide](https://github.com/heygen-com/hyperframes/blob/main/docs/guides/rendering.mdx), [HyperFrames CLI](https://github.com/heygen-com/hyperframes/blob/main/docs/developers/cli.mdx), and [yt-dlp usage](https://github.com/yt-dlp/yt-dlp#usage-and-options).

Font sources: [Montserrat](https://github.com/google/fonts/tree/main/ofl/montserrat) and [Space Mono](https://github.com/google/fonts/tree/main/ofl/spacemono), distributed with their SIL Open Font License files under `public/fonts/`.
