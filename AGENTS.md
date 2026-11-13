# short.it

Local video workspace: React/TypeScript editor, Node server, local Codex or Claude CLI, and HyperFrames exports. This file is an index. Read the relevant contract before editing.

| Area | Document |
| --- | --- |
| Structure, persistence, boundaries | [Architecture](docs/architecture.md) |
| HTTP and streaming | [API](docs/api.md) |
| Agent integration | [Agents](docs/agents.md) |
| Agent-editable video format | [Agent contract](docs/agent-contract.md) |
| References and rendering | [Media](docs/media.md) |
| Interaction and attribution | [UI sources](docs/ui-sources.md) |
| Development and checks | [Development](docs/development.md) |
| Privacy and security | [Security](SECURITY.md) |

Run `npm test`, `npm run build`, and verify affected interactions in a real browser. Add meaningful coverage for nontrivial logic. Keep CLI failures visible. Never turn unavailable tools into simulated successes. Never commit projects, uploaded media, transcripts, credentials, local paths, or personal configuration. Preserve local edits and validate agent-produced JSON before applying it. Keep the server bound to loopback and reject cross-origin requests.
