import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildAgentArgs,
  commandForPath,
  createAgentParser,
  runAgent,
  type AgentEvent,
} from "./agents.ts";

const sessionId = "12345678-1234-5678-1234-123456789abc";
const input = {
  engine: "codex" as const,
  prompt: "Make a short",
  cwd: process.cwd(),
};

test("agent arguments reject injected flags and put large prompts on stdin", () => {
  const prompt = "x".repeat(60_000);
  const launch = buildAgentArgs({
    ...input,
    prompt,
    model: "gpt-6.1-sol",
    effort: "high",
    sessionId,
  });
  assert.deepEqual(launch.args.slice(0, 3), ["exec", "resume", sessionId]);
  assert.equal(launch.args.at(-1), "-");
  assert.equal(launch.stdin, prompt);
  assert.ok(!launch.args.includes(prompt));
  assert.ok(launch.args.includes('sandbox_mode="workspace-write"'));
  assert.ok(!launch.args.some((arg) => arg.includes("bypass")));
  for (const field of ["sessionId", "model", "effort"] as const) {
    assert.throws(() =>
      buildAgentArgs({
        ...input,
        [field]: "--dangerously-bypass-approvals-and-sandbox",
      }),
    );
  }
  assert.throws(() =>
    buildAgentArgs({ ...input, engine: "claude", effort: "ultra" }),
  );
});

test("Claude streams partial text once and reports final usage without repeating it", () => {
  const parser = createAgentParser("claude");
  const events: AgentEvent[] = [];
  const parse = (value: unknown) =>
    events.push(...parser.parse(JSON.stringify(value)));
  parse({ type: "system", subtype: "init", session_id: sessionId });
  parse({
    type: "stream_event",
    event: { type: "message_start", message: { id: "m1" } },
  });
  parse({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "Hello " },
    },
  });
  parse({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "world" },
    },
  });
  parse({
    type: "assistant",
    message: {
      id: "m1",
      content: [{ type: "text", text: "Hello world" }, null],
    },
  });
  parse({
    type: "assistant",
    message: { id: "m2", content: [{ type: "text", text: "Done" }] },
  });
  parse({
    type: "result",
    subtype: "success",
    result: "Done",
    usage: { input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 },
  });
  assert.equal(
    events
      .filter((e) => e.type === "text")
      .map((e) => e.text)
      .join(""),
    "Hello world\n\nDone",
  );
  assert.deepEqual(events.at(-1), {
    type: "usage",
    inputTokens: 5,
    outputTokens: 4,
  });
  assert.equal(parser.completed, true);
  assert.deepEqual(parser.parse("not JSON"), []);
});

test("Codex streams cumulative messages and sanitizes failures and tool output", () => {
  const parser = createAgentParser("codex");
  const parse = (event: unknown) => parser.parse(JSON.stringify(event));
  const events = [
    ...parse({
      type: "item.updated",
      item: { type: "agent_message", id: "m1", text: "Hel" },
    }),
    ...parse({
      type: "item.completed",
      item: { type: "agent_message", id: "m1", text: "Hello" },
    }),
    ...parse({
      type: "item.completed",
      item: { type: "agent_message", id: "m1", text: "Hello" },
    }),
  ];
  assert.equal(
    events
      .filter((e) => e.type === "text")
      .map((e) => e.text)
      .join(""),
    "Hello",
  );
  assert.deepEqual(
    parse({
      type: "item.started",
      item: {
        type: "command_execution",
        command: "secret command",
        aggregated_output: "secret",
      },
    }),
    [{ type: "status", text: "Running a command…" }],
  );
  const failure = parse({
    type: "turn.failed",
    error: {
      message: "Failure at C:\\Users\\private\\config.toml sk-private-value",
    },
  });
  assert.equal(failure[0]?.type, "error");
  assert.ok(!JSON.stringify(failure).includes("private"));
  assert.equal(parser.completed, false);
});

test("Windows command resolution never executes a batch shim", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "short-it-command-test-"),
  );
  try {
    const shim = path.join(directory, "codex.cmd");
    await writeFile(shim, "@echo malicious & exit 1");
    assert.equal(commandForPath(shim, "codex", "win32"), null);
    const entry = path.join(
      directory,
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    await mkdir(path.dirname(entry), { recursive: true });
    await writeFile(entry, "");
    assert.deepEqual(commandForPath(shim, "codex", "win32"), {
      file: process.execPath,
      args: [entry],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("process bridge preserves UTF-8, scopes cwd, flushes the final JSONL line and cancels", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "short-it-process-test-"),
  );
  const fixture = path.join(directory, "fixture.mjs");
  const original = process.env.CODEX_CLI_PATH;
  process.env.CODEX_CLI_PATH = fixture;
  try {
    await writeFile(path.join(directory, "scope-marker.txt"), sessionId);
    await writeFile(
      fixture,
      `
      import { readFileSync } from 'node:fs';
      let prompt = '';
      for await (const chunk of process.stdin) prompt += chunk;
      console.log(JSON.stringify({type:'thread.started',thread_id:'${sessionId}'}));
      if (prompt === 'wait') { setInterval(() => {}, 1000); }
      else {
        const line = Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',id:'1',text:'✓ ' + (readFileSync('scope-marker.txt', 'utf8') === '${sessionId}')}}) + '\\n');
        const split = line.indexOf(Buffer.from('✓')) + 1;
        process.stdout.write(line.subarray(0, split));
        await new Promise(resolve => setTimeout(resolve, 10));
        process.stdout.write(line.subarray(split));
        process.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:2}}));
      }
    `,
    );
    const events: AgentEvent[] = [];
    const result = await runAgent({ ...input, cwd: directory }, (event) =>
      events.push(event),
    );
    assert.equal(result.ok, true);
    assert.equal(result.text, "✓ true");
    assert.equal(result.sessionId, sessionId);
    assert.deepEqual(events.at(-1), {
      type: "usage",
      inputTokens: 10,
      outputTokens: 2,
    });
    const controller = new AbortController();
    const waiting = runAgent(
      { ...input, cwd: directory, prompt: "wait" },
      (event) => {
        if (event.type === "session") controller.abort();
      },
      controller.signal,
    );
    const cancelled = await waiting;
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.ok, false);
  } finally {
    if (original === undefined) delete process.env.CODEX_CLI_PATH;
    else process.env.CODEX_CLI_PATH = original;
    await rm(directory, { recursive: true, force: true });
  }
});
