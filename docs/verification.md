# Verification

The initial implementation was checked with actual local tools, not simulated UI success states.

- Unit and HTTP tests cover document validation, serialized writes, interrupted reference recovery, invalid agent edit rollback, metadata protection, concurrent turns, cancellation, stale revisions, cross-origin rejection, symlink rejection, CLI streaming/parsing and process-tree timeouts.
- Both Codex and Claude Code completed live response smoke tests. A live Codex HTTP turn created a valid three-second video with independent title and shape layers and persisted the accepted document and conversation.
- HyperFrames rendered actual MP4s with text, fades, video, audio and hidden layers. Output duration was checked with ffprobe, and decoded output frames were inspected. A browser export completed and its MP4 download was verified.
- A real public YouTube reference downloaded successfully, extracted all 284 frames, saved the available transcript and reached the ready state. A separate local speech fixture exercised actual faster-whisper CPU transcription without platform captions.
- Bundled fonts and matching text/fade rules keep the supported preview and export representation aligned. This does not establish pixel-perfect parity for arbitrary fonts or effects outside the model.
- `npm run test:ui` contains a repeatable browser smoke flow for project creation, editing, persistence/reload, upload, attachment mentions and undo/redo. It uses an isolated ignored workspace and does not call external AI services.
- Browser regression checks also cover an upload response arriving after another window edits the video. Local edits remain visible and the conflicting save cannot overwrite the other window's document.
- Automated axe checks reported no WCAG 2 A/AA or WCAG 2.1 A/AA violations in nine inspected desktop/mobile interface states after contrast and control-label fixes. This is a focused automated audit, not a claim of complete accessibility conformance for every possible user video.

Live Instagram and TikTok downloads, provider ImageGen tools and external sound libraries were not exercised. Their availability depends on the installed CLI/tools, account, platform restrictions and media licenses. A successful reference analysis does not guarantee exact stylistic reproduction. This editor supports the documented layer model; it does not claim full professional-editor feature parity.
