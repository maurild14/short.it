# Local agent bridge

Short.it runs the locally installed Codex or Claude Code CLI. Sign in with the
CLI's normal login command first; the app does not collect API keys or copy
credentials. Set `CODEX_CLI_PATH` or `CLAUDE_CLI_PATH` to an absolute executable
path if discovery does not find an installation. Restart the server after
changing its environment.

The bridge starts one noninteractive process per turn in the selected project's
directory. It passes large prompts through stdin, streams normalized events,
and saves the returned session ID so the next turn can resume the same CLI
conversation. Each engine has its own session. A model or effort left blank
uses the CLI's configured default. Codex model choices come from the installed
CLI's catalog; older CLIs can still run with their default when catalog discovery
is unavailable. Claude model choices use its supported aliases.

| Behavior         | Codex                                    | Claude Code                         |
| ---------------- | ---------------------------------------- | ----------------------------------- |
| Stream           | `exec --json` message/tool events        | Print mode with partial text events |
| Continue         | `exec resume <session-id>`               | `--resume <session-id>`             |
| File edits       | Workspace-write sandbox                  | Accept-edits mode                   |
| Web              | Live search and workspace network access | WebSearch and WebFetch tools        |
| Image generation | Depends on the CLI, model and account    | Requires a configured tool or skill |

The full CLI tool environment remains available, including locally installed
skills and configured MCP servers where their normal permissions allow it.
Short.it does not add a separate image-generation service, transfer the desktop
app's tools into the CLI, or promise tools that the chosen CLI/account lacks.
Ask the agent to save generated media under the project's `assets/` directory.
Tool progress is streamed without exposing raw commands or tool output. Codex
may emit text only when a message completes; Claude emits token deltas.

The app supplies current project instructions on each turn. The editable project
document is `document.json`, assets belong in `assets/`, and imported reference
transcripts belong in `transcripciones/<id>/`. The server validates project edits
before applying them to the UI. CLI session history stays in each CLI's own data
directory. Deleting an app project does not erase that separate history.

This is a local trusted-user tool. A working directory is project scope, not a
complete operating-system isolation boundary. Codex runs with its workspace
sandbox and no interactive approval prompts. Claude permits its normal file,
shell and web tools without a global permission-bypass flag; shell tools and
user-configured integrations can access resources as the signed-in OS user.
User and organization CLI policies still apply. Do not run an internet-facing
instance with access to a personal CLI login.

On Windows the bridge runs a native `.exe` or resolves a known npm shim to its
JavaScript entry point using Node. It never interpolates prompts into shell
commands or executes arbitrary `.cmd`/`.bat` files. Stop cancels the process tree;
turns also have a 30-minute limit. Leaving a project or closing its browser tab does not cancel a turn. The server owns the run; reconnecting clients recover its progress through the chat status endpoint. Normal server shutdown cancels active agents and waits briefly for accepted project state to settle. Force-killing the server cannot guarantee graceful child-process cleanup. Claude context files use a private temporary
directory and are removed after the process closes. Raw diagnostic output and
authentication/config contents are never returned by status or error endpoints.

Run `npm test` for parser, argument validation, safe Windows resolution and
process streaming/cancellation checks. These tests use small local CLI fixtures
and do not consume model credits.

Command contracts were checked against installed CLI help and the official
[Codex noninteractive documentation](https://learn.chatgpt.com/docs/non-interactive-mode),
[Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
and [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference).
