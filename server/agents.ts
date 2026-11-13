import { spawn, execFile, type ChildProcess } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export type EngineId = "codex" | "claude";
export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "status"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; error: string };
export type EngineStatus = {
  id: EngineId;
  label: string;
  available: boolean;
  reason?: string;
  models: { id: string; label: string; efforts?: string[] }[];
  efforts: { id: string; label: string }[];
  capabilities: {
    webSearch: boolean;
    imageGeneration: "cli-dependent" | "requires-configured-tool";
  };
};
export type AgentInput = {
  engine: EngineId;
  prompt: string;
  systemPrompt?: string;
  cwd: string;
  sessionId?: string;
  model?: string;
  effort?: string;
};
export type AgentRunResult = {
  ok: boolean;
  sessionId?: string;
  text: string;
  cancelled: boolean;
  exitCode: number | null;
};
type Command = { file: string; args: string[] };
type Json = Record<string, any>;

const execFileAsync = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = /^[a-z0-9][a-z0-9._:/-]{0,127}$/i;
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];
const MAX_LINE = 16 * 1024 * 1024;
const MAX_TEXT = 4 * 1024 * 1024;

function isFile(file: string) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Resolve npm shims to their known JS entry points; never execute cmd.exe. */
export function commandForPath(
  file: string,
  engine: EngineId,
  platform = process.platform,
): Command | null {
  if (!isFile(file)) return null;
  if (/\.(?:js|mjs|cjs)$/i.test(file))
    return { file: process.execPath, args: [file] };
  if (platform !== "win32" || /\.exe$/i.test(file)) return { file, args: [] };
  if (!/\.(?:cmd|bat)$/i.test(file)) return null;
  const entry =
    engine === "codex"
      ? path.join(
          path.dirname(file),
          "node_modules",
          "@openai",
          "codex",
          "bin",
          "codex.js",
        )
      : path.join(
          path.dirname(file),
          "node_modules",
          "@anthropic-ai",
          "claude-code",
          "cli.js",
        );
  return isFile(entry) ? { file: process.execPath, args: [entry] } : null;
}

export function findAgentCommand(engine: EngineId): Command | null {
  const override = process.env[`${engine.toUpperCase()}_CLI_PATH`];
  if (override)
    return path.isAbsolute(override) ? commandForPath(override, engine) : null;
  const directories = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  const home = os.homedir();
  const native = process.platform === "win32" ? `${engine}.exe` : engine;
  const candidates = [
    ...directories.map((dir) => path.join(dir.replace(/^"|"$/g, ""), native)),
    path.join(home, ".local", "bin", native),
    ...directories.map((dir) =>
      path.join(dir.replace(/^"|"$/g, ""), `${engine}.cmd`),
    ),
    path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "npm",
      `${engine}.cmd`,
    ),
    `/usr/local/bin/${engine}`,
    `/opt/homebrew/bin/${engine}`,
  ];
  for (const file of candidates) {
    const command = commandForPath(file, engine);
    if (command) return command;
  }
  return null;
}

async function probe(
  command: Command,
  args: string[],
  maxBuffer = 4 * 1024 * 1024,
) {
  return execFileAsync(command.file, [...command.args, ...args], {
    shell: false,
    windowsHide: true,
    timeout: 8_000,
    maxBuffer,
    encoding: "utf8",
  });
}

export async function listEngines(): Promise<EngineStatus[]> {
  return Promise.all(
    (["codex", "claude"] as const).map(async (id) => {
      const levels = id === "claude" ? EFFORTS.slice(0, -1) : EFFORTS;
      const status: EngineStatus = {
        id,
        label: id === "codex" ? "Codex" : "Claude Code",
        available: false,
        models:
          id === "claude"
            ? ["opus", "sonnet", "haiku", "fable"].map((id) => ({
                id,
                label: id[0].toUpperCase() + id.slice(1),
              }))
            : [],
        efforts: levels.map((id) => ({
          id,
          label:
            id === "xhigh" ? "Extra high" : id[0].toUpperCase() + id.slice(1),
        })),
        capabilities: {
          webSearch: true,
          imageGeneration:
            id === "codex" ? "cli-dependent" : "requires-configured-tool",
        },
      };
      const command = findAgentCommand(id);
      if (!command)
        return {
          ...status,
          reason:
            "CLI not found. Install it or set its CLI_PATH environment variable.",
        };
      try {
        await probe(
          command,
          id === "codex" ? ["login", "status"] : ["auth", "status"],
        );
        status.available = true;
      } catch {
        return {
          ...status,
          reason:
            "CLI is unavailable or signed out. Check it in a terminal and sign in.",
        };
      }
      if (id === "codex") {
        try {
          const { stdout } = await probe(command, ["debug", "models"]);
          const catalog: unknown = JSON.parse(stdout);
          if (
            catalog &&
            typeof catalog === "object" &&
            "models" in catalog &&
            Array.isArray(catalog.models)
          ) {
            status.models = catalog.models
              .filter(
                (m: Json) =>
                  m.visibility === "list" &&
                  MODEL.test(m.slug) &&
                  typeof m.display_name === "string",
              )
              .map((m: Json) => ({
                id: m.slug,
                label: m.display_name.slice(0, 80),
                efforts: Array.isArray(m.supported_reasoning_levels)
                  ? m.supported_reasoning_levels
                      .map((e: Json) => e.effort)
                      .filter(
                        (e: unknown) =>
                          typeof e === "string" && EFFORTS.includes(e),
                      )
                  : [],
              }));
          }
        } catch {
          // shortcut: older CLIs have no catalog command; their configured default still works.
        }
      }
      return status;
    }),
  );
}

function safeFailure(value: unknown): string {
  const message = typeof value === "string" ? value : "";
  if (/rate.?limit|usage.?limit|quota|budget|429/i.test(message))
    return "The agent reached an account usage limit. Check your plan in the CLI.";
  if (/auth|log.?in|sign.?in|credential|401|403/i.test(message))
    return "The agent could not authenticate. Sign in using the CLI in a terminal.";
  if (
    /model.*(?:unavailable|not found|not supported|newer version|invalid)|unsupported.*model/i.test(
      message,
    )
  )
    return "The selected model is unavailable. Try the CLI default or update the CLI.";
  if (/permission|denied|sandbox/i.test(message))
    return "The CLI denied a tool or file operation. Check its permissions in a terminal.";
  return "The agent could not complete this turn. Run its CLI in a terminal for details.";
}

function toolStatus(name: unknown): string {
  const tool = String(name ?? "");
  if (/image.?gen|generate.?image/i.test(tool)) return "Generating an image…";
  if (/web.?search|web_search/i.test(tool)) return "Searching the web…";
  if (/web.?fetch/i.test(tool)) return "Reading a web page…";
  if (/write|edit|patch|file_change/i.test(tool))
    return "Editing project files…";
  if (/read|glob|grep|image_view/i.test(tool)) return "Reading project files…";
  if (/bash|shell|command|exec/i.test(tool)) return "Running a command…";
  return "Using an agent tool…";
}

export function createAgentParser(engine: EngineId) {
  let sawText = false;
  let currentMessage = "";
  const streamedMessages = new Set<string>();
  const textByItem = new Map<string, string>();
  const parser = {
    completed: false,
    parse(line: string): AgentEvent[] {
      let event: Json;
      try {
        event = JSON.parse(line);
      } catch {
        return [];
      }
      if (!event || typeof event !== "object") return [];
      const out: AgentEvent[] = [];
      const session = event.session_id ?? event.thread_id;
      if (typeof session === "string" && UUID.test(session))
        out.push({ type: "session", sessionId: session });
      const text = (value: unknown, key: string, cumulative = false) => {
        if (typeof value !== "string" || !value) return;
        const previous = textByItem.get(key) ?? "";
        const delta =
          cumulative && value.startsWith(previous)
            ? value.slice(previous.length)
            : value;
        if (!delta) return;
        const prefix = !textByItem.has(key) && sawText ? "\n\n" : "";
        textByItem.set(key, cumulative ? value : previous + value);
        sawText = true;
        out.push({ type: "text", text: prefix + delta });
      };
      if (engine === "codex") {
        if (event.type === "turn.completed") {
          parser.completed = true;
          if (event.usage)
            out.push({
              type: "usage",
              inputTokens: Number(event.usage.input_tokens) || 0,
              outputTokens: Number(event.usage.output_tokens) || 0,
            });
        } else if (event.type === "turn.failed" || event.type === "error") {
          out.push({
            type: "error",
            error: safeFailure(event.error?.message ?? event.message),
          });
        } else if (
          ["item.started", "item.updated", "item.completed"].includes(
            event.type,
          ) &&
          event.item
        ) {
          const item = event.item;
          if (item.type === "agent_message" && event.type !== "item.started")
            text(item.text, String(item.id ?? "message"), true);
          else if (item.type !== "reasoning" && item.type !== "agent_message")
            out.push({
              type: "status",
              text: toolStatus(item.kind ?? item.type),
            });
        }
        return out;
      }
      if (event.parent_tool_use_id) return [];
      if (event.type === "stream_event" && event.event) {
        const chunk = event.event;
        if (chunk.type === "message_start")
          currentMessage = chunk.message?.id ?? `message-${textByItem.size}`;
        if (
          chunk.type === "content_block_start" &&
          chunk.content_block?.type === "tool_use"
        ) {
          out.push({
            type: "status",
            text: toolStatus(chunk.content_block.name),
          });
        }
        const delta =
          chunk.type === "content_block_delta" &&
          chunk.delta?.type === "text_delta"
            ? chunk.delta.text
            : chunk.type === "content_block_start" &&
                chunk.content_block?.type === "text"
              ? chunk.content_block.text
              : undefined;
        if (typeof delta === "string" && delta) {
          streamedMessages.add(currentMessage);
          text(delta, currentMessage);
        }
      } else if (
        event.type === "assistant" &&
        Array.isArray(event.message?.content)
      ) {
        const id = String(event.message.id ?? currentMessage ?? "message");
        for (const block of event.message.content) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "text" && !streamedMessages.has(id))
            text(block.text, id);
          if (block.type === "tool_use")
            out.push({ type: "status", text: toolStatus(block.name) });
        }
      } else if (event.type === "result") {
        parser.completed = true;
        if (event.is_error || event.subtype !== "success")
          out.push({
            type: "error",
            error: safeFailure(
              event.result ??
                (Array.isArray(event.errors) ? event.errors.join(" ") : ""),
            ),
          });
        else if (!sawText) text(event.result, "result");
        if (event.usage)
          out.push({
            type: "usage",
            inputTokens:
              (Number(event.usage.input_tokens) || 0) +
              (Number(event.usage.cache_read_input_tokens) || 0) +
              (Number(event.usage.cache_creation_input_tokens) || 0),
            outputTokens: Number(event.usage.output_tokens) || 0,
          });
      }
      return out;
    },
  };
  return parser;
}

export function buildAgentArgs(
  input: AgentInput,
  systemPromptFile?: string,
): { args: string[]; stdin: string } {
  if (input.engine !== "codex" && input.engine !== "claude")
    throw new Error("Unknown agent engine.");
  if (
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > MAX_TEXT
  )
    throw new Error("The agent prompt is empty or too large.");
  if (
    input.systemPrompt !== undefined &&
    (typeof input.systemPrompt !== "string" ||
      input.systemPrompt.length > MAX_TEXT)
  )
    throw new Error("The project context is too large.");
  if (
    input.sessionId &&
    (typeof input.sessionId !== "string" || !UUID.test(input.sessionId))
  )
    throw new Error("Invalid agent session ID.");
  if (
    input.model &&
    (typeof input.model !== "string" || !MODEL.test(input.model))
  )
    throw new Error("Invalid model name.");
  const efforts = input.engine === "claude" ? EFFORTS.slice(0, -1) : EFFORTS;
  if (input.effort && !efforts.includes(input.effort))
    throw new Error("Invalid reasoning effort for this agent.");
  if (input.engine === "codex") {
    const args = input.sessionId
      ? ["exec", "resume", input.sessionId]
      : ["exec"];
    args.push(
      "--json",
      "--skip-git-repo-check",
      "-c",
      'sandbox_mode="workspace-write"',
      "-c",
      'approval_policy="never"',
      "-c",
      "sandbox_workspace_write.network_access=true",
      "-c",
      'web_search="live"',
    );
    if (input.model) args.push("--model", input.model);
    if (input.effort)
      args.push("-c", `model_reasoning_effort="${input.effort}"`);
    args.push("-");
    return {
      args,
      stdin: input.systemPrompt
        ? `${input.systemPrompt}\n\n---\n\nUser message:\n${input.prompt}`
        : input.prompt,
    };
  }
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
    "WebSearch",
    "WebFetch",
  ];
  if (systemPromptFile)
    args.push("--append-system-prompt-file", systemPromptFile);
  if (input.model) args.push("--model", input.model);
  if (input.effort) args.push("--effort", input.effort);
  if (input.sessionId) args.push("--resume", input.sessionId);
  return { args, stdin: input.prompt };
}

function killTree(child: ChildProcess, force = false) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const taskkill = path.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "taskkill.exe",
    );
    spawn(taskkill, ["/pid", String(child.pid), "/t", "/f"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    }).on("error", () => child.kill());
  } else {
    const signal = force ? "SIGKILL" : "SIGTERM";
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  }
}

export async function runAgent(
  input: AgentInput,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<AgentRunResult> {
  buildAgentArgs(input);
  if (
    !path.isAbsolute(input.cwd) ||
    !existsSync(input.cwd) ||
    !statSync(input.cwd).isDirectory()
  )
    throw new Error("The project working directory is unavailable.");
  const cwd = await realpath(input.cwd);
  if (signal?.aborted)
    return { ok: false, text: "", cancelled: true, exitCode: null };
  const command = findAgentCommand(input.engine);
  if (!command) {
    onEvent({
      type: "error",
      error: "The agent CLI was not found. Install it and restart the server.",
    });
    return { ok: false, text: "", cancelled: false, exitCode: null };
  }
  let temporaryDirectory: string | undefined;
  try {
    let systemPromptFile: string | undefined;
    if (input.engine === "claude" && input.systemPrompt) {
      temporaryDirectory = await mkdtemp(
        path.join(os.tmpdir(), "short-it-agent-"),
      );
      systemPromptFile = path.join(temporaryDirectory, "context.txt");
      await writeFile(systemPromptFile, input.systemPrompt, { mode: 0o600 });
    }
    const launch = buildAgentArgs(input, systemPromptFile);
    return await new Promise<AgentRunResult>((resolve) => {
      const child = spawn(command.file, [...command.args, ...launch.args], {
        cwd,
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const parser = createAgentParser(input.engine);
      let buffer = "";
      let text = "";
      let sessionId = input.sessionId;
      let failed = false;
      let cancelled = false;
      let settled = false;
      let stderr = "";
      let forceTimer: ReturnType<typeof setTimeout> | undefined;
      const terminate = () => {
        killTree(child);
        forceTimer ??= setTimeout(() => killTree(child, true), 5_000);
        forceTimer.unref();
      };
      const emit = (event: AgentEvent) => {
        if (cancelled) return;
        if (event.type === "session") sessionId = event.sessionId;
        if (event.type === "text") text += event.text;
        if (event.type === "error") failed = true;
        try {
          onEvent(event);
        } catch {
          cancel();
        }
      };
      const cancel = () => {
        if (settled || cancelled) return;
        cancelled = true;
        terminate();
      };
      const fail = (error: string) => {
        if (!failed) emit({ type: "error", error });
        terminate();
      };
      const consume = (line: string) => {
        for (const event of parser.parse(line)) {
          if (
            event.type === "text" &&
            text.length + event.text.length > MAX_TEXT
          ) {
            fail("The agent response exceeded the stream limit.");
            return;
          }
          emit(event);
        }
      };
      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(forceTimer);
        signal?.removeEventListener("abort", cancel);
        if (buffer.trim() && !cancelled) consume(buffer);
        if (!cancelled && !failed && (exitCode !== 0 || !parser.completed))
          emit({ type: "error", error: safeFailure(stderr) });
        resolve({
          ok: !cancelled && !failed && exitCode === 0 && parser.completed,
          sessionId,
          text,
          cancelled,
          exitCode,
        });
      };
      const timer = setTimeout(
        () =>
          fail(
            "The agent turn exceeded 30 minutes. Start a new turn to continue.",
          ),
        30 * 60_000,
      );
      timer.unref();
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (cancelled || settled) return;
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line.length > MAX_LINE) {
            fail("The CLI emitted an oversized stream event.");
            return;
          }
          if (line.trim()) consume(line);
        }
        if (buffer.length > MAX_LINE)
          fail("The CLI emitted an oversized stream event.");
      });
      // Keep diagnostics private; only classified, fixed messages reach the browser.
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-8192);
      });
      child.stdin.on("error", () => {});
      child.stdout.on("error", () => fail("The agent output stream failed."));
      child.stderr.on("error", () =>
        fail("The agent diagnostic stream failed."),
      );
      child.on("error", () => {
        emit({
          type: "error",
          error:
            "The agent CLI could not start. Check its installation in a terminal.",
        });
        finish(null);
      });
      child.on("close", finish);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      child.stdin.end(launch.stdin);
    });
  } finally {
    if (temporaryDirectory)
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => {},
      );
  }
}
