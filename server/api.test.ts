import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { Project } from "../src/shared/types.ts";

test(
  "HTTP API preserves edits, serializes chat, cancels, and rejects linked media",
  { timeout: 30_000 },
  async (t) => {
    const temporary = await mkdtemp(
      path.join(os.tmpdir(), "short-it-api-test-"),
    );
    const workspace = path.join(temporary, "projects");
    const fixture = path.join(temporary, "fixture.mjs");
    const appRoot = fileURLToPath(new URL("../", import.meta.url));
    await writeFile(
      fixture,
      `
    import {readFile,writeFile,access} from 'node:fs/promises';
    let prompt=''; for await (const part of process.stdin) prompt+=part;
    const mode=prompt.split('User message:\\n').at(-1).trim();
    console.log(JSON.stringify({type:'thread.started',thread_id:'12345678-1234-5678-1234-123456789abc'}));
    if(mode==='WAIT') setInterval(()=>{},1000);
    else {
      if(mode==='BACKGROUND') {
        console.log(JSON.stringify({type:'item.completed',item:{id:'progress',type:'agent_message',text:'Working in background'}}));
        while(true) {
          try { await access('release-test'); break; } catch {}
          await new Promise(resolve=>setTimeout(resolve,30));
        }
        const doc=JSON.parse(await readFile('document.json','utf8'));
        doc.background='#123456';
        await writeFile('document.json',JSON.stringify(doc));
      }
      if(mode==='CORRUPT_METADATA') await writeFile('project.json','{"name":"CORRUPTED","assets":[],"messages":[]}');
      if(mode==='BAD_ASSET') {
        const doc=JSON.parse(await readFile('document.json','utf8'));
        doc.background='#ff0000';
        doc.layers=[{id:'bad',name:'Missing image',type:'image',assetId:'missing',start:0,duration:1,track:0,x:0,y:0,width:100,height:100,rotation:0,opacity:1}];
        await writeFile('document.json',JSON.stringify(doc));
      }
      console.log(JSON.stringify({type:'item.completed',item:{id:'m1',type:'agent_message',text:process.argv.includes('resume')?'RESUMED':'DONE'}}));
      if(mode==='FAIL') process.exit(1);
      console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));
    }
  `,
    );
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts", "--workspace", workspace],
      {
        cwd: appRoot,
        env: {
          ...process.env,
          SHORT_IT_PORT: String(port),
          CODEX_CLI_PATH: fixture,
        },
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const origin = `http://127.0.0.1:${port}`;
    const request = (route: string, method = "GET", body?: unknown) =>
      fetch(origin + route, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Test server did not start")),
          15_000,
        );
        child.stdout.on("data", (chunk) => {
          if (String(chunk).includes("short.it ·")) {
            clearTimeout(timeout);
            resolve();
          }
        });
        child.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.on("exit", (code) => {
          clearTimeout(timeout);
          reject(new Error(`Test server exited: ${code}`));
        });
        child.stderr.resume();
      });
      const created = await request("/api/projects", "POST", {
        name: "API fixture",
      });
      assert.equal(created.status, 201);
      const project: Project = await created.json();
      const route = `/api/projects/${project.id}`;
      const directory = path.join(workspace, project.id);

      await t.test(
        "invalid agent references restore both accepted and interchange documents",
        async () => {
          const response = await request(`${route}/chat`, "POST", {
            message: "BAD_ASSET",
            engine: "codex",
          });
          assert.equal(response.status, 200);
          const stream = await response.text();
          assert.match(stream, /invalid edit/);
          const current: Project = await (await request(route)).json();
          assert.deepEqual(current.document, project.document);
          assert.match(
            current.messages.at(-1)!.content,
            /Generation failed.*No edit was applied/,
          );
          assert.doesNotMatch(current.messages.at(-1)!.content, /DONE|RESUMED/);
          const rejected = await (await request(`${route}/chat`)).json();
          assert.equal(rejected.running, false);
          assert.equal(rejected.status, "Failed");
          assert.match(rejected.error, /invalid edit/);
          assert.deepEqual(
            JSON.parse(
              await readFile(path.join(directory, "document.json"), "utf8"),
            ),
            project.document,
          );
          const continuation = await request(`${route}/chat`, "POST", {
            message: "OK",
            engine: "codex",
          });
          assert.match(await continuation.text(), /RESUMED/);
        },
      );

      await t.test(
        "a failed CLI cannot persist its premature success claim",
        async () => {
          const before: Project = await (await request(route)).json();
          const response = await request(`${route}/chat`, "POST", {
            message: "FAIL",
            engine: "codex",
          });
          await response.text();
          const state = await (await request(`${route}/chat`)).json();
          assert.equal(state.status, "Failed");
          assert.deepEqual(state.project.document, before.document);
          assert.match(
            state.project.messages.at(-1).content,
            /Generation failed.*No edit was applied/,
          );
          assert.doesNotMatch(
            state.project.messages.at(-1).content,
            /DONE|RESUMED/,
          );
        },
      );

      await t.test(
        "simultaneous chat requests reserve exactly one turn and cancellation unlocks editing",
        async () => {
          const responses = await Promise.all(
            [1, 2].map(() =>
              request(`${route}/chat`, "POST", {
                message: "WAIT",
                engine: "codex",
              }),
            ),
          );
          assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
          assert.equal(
            (await request(route, "PUT", { name: "Blocked" })).status,
            409,
          );
          await request(`${route}/cancel`, "POST", {});
          await responses.find((r) => r.status === 200)!.text();
          assert.equal(
            (await request(route, "PUT", { name: "After stop" })).status,
            200,
          );
        },
      );

      await t.test(
        "disconnected chat keeps running and saves its result",
        async () => {
          const response = await request(`${route}/chat`, "POST", {
            message: "BACKGROUND",
            engine: "codex",
          });
          assert.equal(response.status, 200);
          const snapshot = async () => (await request(`${route}/chat`)).json();
          let active = await snapshot();
          for (let i = 0; !active.text && i < 100; i++) {
            await new Promise((resolve) => setTimeout(resolve, 30));
            active = await snapshot();
          }
          assert.equal(active.running, true);
          assert.match(active.text, /Working in background/);
          await response.body!.cancel();
          await new Promise((resolve) => setTimeout(resolve, 100));
          assert.equal((await snapshot()).running, true);
          assert.equal(
            (await request(route, "PUT", { name: "Blocked" })).status,
            409,
          );
          await writeFile(path.join(directory, "release-test"), "ready");
          let finished = await snapshot();
          for (let i = 0; finished.running && i < 100; i++) {
            await new Promise((resolve) => setTimeout(resolve, 30));
            finished = await snapshot();
          }
          assert.equal(finished.running, false);
          assert.equal(finished.status, "Completed");
          assert.equal(finished.project.document.background, "#123456");
          assert.match(
            finished.project.messages.at(-1).content,
            /Working in background/,
          );
          assert.equal(
            (await request(route, "PUT", { name: "After background" })).status,
            200,
          );
        },
      );

      await t.test("explicit stop cancels a disconnected run", async () => {
        const response = await request(`${route}/chat`, "POST", {
          message: "WAIT",
          engine: "codex",
        });
        await response.body!.cancel();
        assert.equal(
          (await (await request(`${route}/chat`)).json()).running,
          true,
        );
        await request(`${route}/cancel`, "POST", {});
        let state = await (await request(`${route}/chat`)).json();
        for (let i = 0; state.running && i < 100; i++) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          state = await (await request(`${route}/chat`)).json();
        }
        assert.equal(state.running, false);
        assert.equal(state.status, "Stopped");
        assert.match(
          state.project.messages.at(-1).content,
          /Generation stopped.*No edit was applied/,
        );
        assert.equal(state.project.document.background, "#123456");
      });

      await t.test("stale revisions and cross-origin writes fail", async () => {
        const current: Project = await (await request(route)).json();
        assert.equal(
          (
            await request(route, "PUT", {
              name: "Fresh",
              revision: current.revision,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(route, "PUT", {
              name: "Stale",
              revision: current.revision,
            })
          ).status,
          409,
        );
        const blocked = await fetch(origin + "/api/projects", {
          method: "POST",
          headers: {
            Origin: "https://example.invalid",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Foreign" }),
        });
        assert.equal(blocked.status, 403);
        assert.equal((await (await request(route)).json()).name, "Fresh");
      });

      await t.test(
        "agent changes to metadata cannot erase project name, assets or conversation",
        async () => {
          const form = new FormData();
          const png = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          );
          form.append(
            "files",
            new Blob([png], { type: "image/png" }),
            "preserved.png",
          );
          const upload = await fetch(origin + route + "/assets", {
            method: "POST",
            body: form,
          });
          assert.equal(upload.status, 201);
          const before: Project = await upload.json();
          const response = await request(`${route}/chat`, "POST", {
            message: "CORRUPT_METADATA",
            engine: "codex",
          });
          const stream = await response.text();
          assert.match(stream, /"type":"done"/);
          const after: Project = await (await request(route)).json();
          assert.equal(after.name, before.name);
          assert.deepEqual(after.assets, before.assets);
          assert.deepEqual(
            after.messages.slice(0, before.messages.length),
            before.messages,
          );
          assert.equal(after.messages.length, before.messages.length + 2);
          assert.equal(
            JSON.parse(
              await readFile(path.join(directory, "project.json"), "utf8"),
            ).name,
            before.name,
          );
        },
      );

      await t.test("a linked media directory is not served", async () => {
        const form = new FormData();
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        );
        form.append(
          "files",
          new Blob([png], { type: "image/png" }),
          "pixel.png",
        );
        const response = await fetch(origin + route + "/assets", {
          method: "POST",
          body: form,
        });
        assert.equal(response.status, 201);
        const current: Project = await response.json();
        const asset = current.assets[0];
        assert.ok(asset);
        const outside = path.join(temporary, "outside-media");
        await mkdir(outside);
        await writeFile(path.join(outside, asset.filename), "PRIVATE_FIXTURE");
        await rename(
          path.join(directory, "assets"),
          path.join(directory, "assets-original"),
        );
        await symlink(
          outside,
          path.join(directory, "assets"),
          process.platform === "win32" ? "junction" : "dir",
        );
        const blocked = await request(`${route}/assets/${asset.id}`);
        assert.equal(blocked.status, 400);
        assert.ok(!(await blocked.text()).includes("PRIVATE_FIXTURE"));
      });
    } finally {
      child.kill();
      if (child.exitCode === null) await once(child, "exit");
      assert.equal(path.dirname(temporary), os.tmpdir());
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
