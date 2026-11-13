# Architecture

short.it is a local application, not a hosted service. One Node process serves the API and the Vite development middleware or production React bundle on 127.0.0.1:3210. No database, hosted account, or application API key is required. AI providers and media tools can have their own account requirements.

The launch directory determines the default `projects/` directory. `--workspace <directory>` or SHORT_IT_WORKSPACE overrides it. Every project has a random ID and its own directory:

```
projects/<id>/
  project.json
  document.json
  assets/
  transcripciones/<reference-id>/
  hyperframes/
  exports/
```

project.json stores the project, assets, reference status, chat messages, CLI session IDs, and the accepted video document. document.json is the agent's editable interchange file. The server validates it and its asset references before accepting an agent edit. Failed/cancelled edits preserve the last accepted video. User edits use atomic JSON replacement and serialized project mutations. Revision checks protect clients that submit a revision from overwriting a newer save.

The visual editor and HyperFrames compiler share a typed layer document. Text, shapes, image, video and audio each have timing and geometry. The compiler creates HTML with deterministic timing; it does not execute generated agent HTML inside the application. This preserves direct editing at the cost of limiting arbitrary effects to the document format. Current effects are fades; extending the model requires matching editor, preview, compiler and tests.

Uploads are stored locally and identified by file signature. The agent can add supported media under assets/; the server registers validated files when accepting its changes. Reference processing and exports run asynchronously. Their live job records are in memory; restarting the server loses job progress/download URLs, but files and saved project data remain on disk. Concurrent exports for a project are rejected.

The CLI bridge uses the installed provider CLI and its existing authentication. It streams normalized events to the browser. The app itself does not copy authentication files or expose them to the frontend. CLI tools can send prompts, reference content and attached media to their configured providers; local storage does not mean offline AI.
