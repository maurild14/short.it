# Development

Use Node 22.18 or newer. Install dependencies with `npm ci`. `npm run dev` serves the application on http://127.0.0.1:3210 with hot reload. `npm run build` typechecks and creates the production frontend; `npm start` serves it. `npm test` runs Node's test runner through tsx. `npm run doctor` checks optional runtime tools.

For the repeatable browser check, run `npx playwright install chromium` once, then `npm run test:ui`. It starts an isolated server and stores its test projects and failure traces in the ignored `.short-it/` directory. It does not call a paid model or rendering service.

To store projects in a chosen directory:

```sh
npm run dev -- --workspace /path/to/video-projects
```

To launch from a different working directory, invoke the installed repository's `node_modules/tsx/dist/cli.mjs` with its absolute `server/index.ts` path. The server resolves its UI files relative to its own location and stores projects relative to the launching process's working directory. A CLI session can start this command in the background and then use the local UI.

Install and authenticate Codex or Claude Code separately. Install FFmpeg (including ffprobe) and yt-dlp for reference ingestion. Captionless references additionally need faster-whisper or the Whisper transcription CLI; see media documentation. HyperFrames is resolved locally or through its pinned npm CLI fallback. Rendering may download browser/runtime assets on first use and is subject to the tool's own usage terms.

Do not commit generated projects or test artifacts. Tests use temporary directories. Verify import, edit, save/reload, playback, chat failure handling, and export in a real browser after changes to those flows. Report tool-dependent tests that could not run; passing unit tests do not prove an external provider works.
