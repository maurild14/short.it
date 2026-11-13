# short.it

A local workspace for making short-form videos with Codex or Claude Code. Bring references, attach your narration and music, describe the video, then edit the result on a canvas and timeline. HyperFrames renders the finished composition.

## Start

Requires Node 22.18+.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3210. For production, run `npm run build` followed by `npm start`. Use `npm run doctor` to check external tools. Install and authenticate a supported agent CLI separately. FFmpeg and yt-dlp are required for reference processing; references without subtitles need faster-whisper or the Whisper CLI. HyperFrames is invoked through a pinned CLI fallback if not installed locally.

Projects are stored in `projects/` beneath the directory from which the server is launched. Override it with `npm run dev -- --workspace /path/to/projects`. Runtime files are ignored by Git.

To launch the harness from Codex or Claude Code in another folder, build once, then run `node /path/to/short.it/scripts/short-it.mjs` from that folder. The UI remains in the browser; projects stay beneath the folder where you launched it. Add `--dev` for development. You can also run `npm link` in the repository to make the `short-it` command available locally.

## Workflow

1. Create a project and add up to five YouTube, Shorts, Instagram Reel or TikTok references. The pipeline downloads the video, extracts its full frame sequence and saves the transcript under `transcripciones/`.
2. Drop in audio, images or video. Mention attachments in chat and tell the agent which audio is narration or music.
3. Choose Codex or Claude Code, model and effort. Ask for a video using your script and references.
4. Adjust layers, placement, size, timing and audio in the editor. Save edits and export an MP4 through HyperFrames.

## What is supported

The editor works with positioned text, shapes, images, video and audio, including trims and fades. It keeps an editable document instead of importing arbitrary generated HTML. This is an initial implementation, not feature parity with a professional nonlinear editor. Complex effects outside the document model need a model/compiler/editor extension. Reference-style fidelity depends on the agent, available media and supported effects; exact reproduction is not guaranteed.

Web search, image search and image generation are provided by the selected CLI's available tools. Codex ImageGen is not guaranteed in every CLI installation; Claude requires a configured image tool. Missing capabilities and dependency failures are surfaced instead of simulated. Download availability depends on the source platform. AI, generation and rendering services may have their own pricing and terms.

## Open source

MIT licensed. See [documentation](docs/README.md), [contributing](CONTRIBUTING.md), and [privacy/security](SECURITY.md). No project media, local authentication or private configuration belongs in the repository.
