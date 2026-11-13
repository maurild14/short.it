#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(
  new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
const server = fileURLToPath(new URL("../server/index.ts", import.meta.url));
const child = spawn(process.execPath, [cli, server, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
  windowsHide: true,
});
child.on("error", () => {
  console.error(
    "Could not start short.it. Run npm install in its repository first.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
