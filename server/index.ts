import express from "express";
import multer from "multer";
import { fileTypeFromFile } from "file-type";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ProjectStore,
  HttpError,
  atomicJson,
  documentSchema,
  validateAssetReferences,
  safeId,
} from "./store.ts";
import { listEngines, runAgent, type AgentEvent } from "./agents.ts";
import {
  validateReferenceUrl,
  processReference,
  probeMediaDependencies,
  probeMediaFile,
  findExecutable,
} from "./media.ts";
import { renderComposition } from "./composition.ts";
import type { Asset, Job, Project } from "../src/shared/types.ts";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const args = process.argv.slice(2);
const workspaceIndex = args.indexOf("--workspace");
const workspace =
  workspaceIndex >= 0
    ? args[workspaceIndex + 1]
    : process.env.SHORT_IT_WORKSPACE;
if (workspaceIndex >= 0 && !workspace)
  throw new Error("--workspace requires a directory");
const store = new ProjectStore(
  workspace || path.join(process.cwd(), "projects"),
);
await store.init();
await store.recoverInterruptedReferences();
const uploadRoot = path.join(store.root, ".uploads");
await mkdir(uploadRoot, { recursive: true });
const port = Number(process.env.SHORT_IT_PORT || 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid SHORT_IT_PORT");
const app = express();
const server = createServer(app);
app.disable("x-powered-by");
const jobs = new Map<string, Job>();
const exportPaths = new Map<string, string>();
const running = new Map<string, AbortController>();
const importing = new Set<string>();
const deleting = new Set<string>();
let shuttingDown = false;
const chatStates = new Map<
  string,
  { text: string; status: string; error?: string }
>();

app.use((req, res, next) => {
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
    return res.status(403).json({ error: "Local requests only" });
  const origin = req.headers.origin;
  if (
    (origin && origin !== `http://${host}`) ||
    req.headers["sec-fetch-site"] === "cross-site"
  )
    return res
      .status(403)
      .json({ error: "Cross-origin requests are not allowed" });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "32mb" }));
const upload = multer({
  dest: uploadRoot,
  limits: { fileSize: 512 * 1024 * 1024, files: 10, fields: 0 },
});
const projectName = z.string().trim().min(1).max(100);
function requireIdle(id: string) {
  requireAvailable(id);
  if (shuttingDown) throw new HttpError(503, "The server is shutting down.");
  if (running.has(id) || importing.has(id))
    throw new HttpError(
      409,
      "Wait for the current operation to finish or stop the agent before editing.",
    );
}
function requireAvailable(id: string) {
  if (deleting.has(id))
    throw new HttpError(409, "This project is being deleted.");
}
function message(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  if (error instanceof HttpError) return error.message;
  return (error instanceof Error ? error.message : "Operation failed")
    .replace(/[A-Z]:\\[^\r\n"<>]+/gi, "[local path]")
    .replace(/\/Users\/[^\s"<>]+/g, "[local path]");
}
function addJob(projectId: string, type: Job["type"]) {
  if (jobs.size > 1000)
    for (const [id, job] of jobs)
      if (job.status === "done" || job.status === "error") {
        jobs.delete(id);
        exportPaths.delete(id);
        if (jobs.size <= 500) break;
      }
  const job: Job = { id: randomUUID(), projectId, type, status: "queued" };
  jobs.set(job.id, job);
  return job;
}
app.get("/api/engines", async (_req, res) => res.json(await listEngines()));
app.get("/api/health", async (_req, res) =>
  res.json({ ok: true, dependencies: await probeMediaDependencies() }),
);
app.get("/api/projects", async (_req, res) => res.json(await store.list()));
app.get("/api/folders", async (_req, res) => res.json(await store.folders()));
app.post("/api/folders", async (req, res) =>
  res
    .status(201)
    .json(await store.createFolder(projectName.parse(req.body.name))),
);
app.delete("/api/folders/:id", async (req, res) => {
  await store.removeFolder(req.params.id);
  res.status(204).end();
});
app.put("/api/projects/:id/folder", async (req, res) => {
  const { folderId } = z
    .object({ folderId: z.string().uuid().nullable() })
    .strict()
    .parse(req.body);
  requireAvailable(req.params.id);
  res.json(await store.move(req.params.id, folderId));
});
app.delete("/api/projects/:id", async (req, res) => {
  const id = safeId(req.params.id);
  requireIdle(id);
  if (
    [...jobs.values()].some(
      (job) =>
        job.projectId === id && ["queued", "running"].includes(job.status),
    )
  )
    throw new HttpError(
      409,
      "Wait for the current operation to finish before deleting this project.",
    );
  deleting.add(id);
  try {
    await store.remove(id);
    chatStates.delete(id);
    for (const [jobId, job] of jobs) {
      if (job.projectId === id) {
        jobs.delete(jobId);
        exportPaths.delete(jobId);
      }
    }
    res.status(204).end();
  } finally {
    deleting.delete(id);
  }
});
app.post("/api/projects", async (req, res) => {
  const body = z
    .object({
      name: projectName,
      folderId: z.string().uuid().nullable().optional(),
    })
    .parse(req.body);
  res.status(201).json(await store.create(body.name, body.folderId));
});
app.get("/api/projects/:id", async (req, res) =>
  res.json(await store.read(req.params.id)),
);
app.put("/api/projects/:id", async (req, res) => {
  const id = req.params.id;
  requireIdle(id);
  const body = z
    .object({
      name: projectName.optional(),
      document: documentSchema.optional(),
      revision: z.number().int().optional(),
    })
    .strict()
    .parse(req.body);
  const project = await store.update(id, async (p) => {
    requireIdle(id);
    if (body.revision !== undefined && p.revision !== body.revision)
      throw new HttpError(409, "Project changed. Reload before saving.");
    if (body.name) p.name = body.name;
    if (body.document) {
      validateAssetReferences(body.document, p);
      p.document = body.document;
      await atomicJson(
        path.join(store.directory(id), "document.json"),
        p.document,
      );
    }
  });
  res.json(project);
});

const supported = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/ogg",
  "audio/opus",
  "audio/mp4",
  "video/mp4",
  "video/webm",
  "audio/webm",
  "video/quicktime",
]);
async function identifyAsset(
  filename: string,
  name: string,
  id: string,
): Promise<Asset> {
  if ((await lstat(path.dirname(filename))).isSymbolicLink())
    throw new HttpError(400, "Media directory links are not supported");
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink())
    throw new HttpError(400, "Media must be a regular file");
  const detected = await fileTypeFromFile(filename);
  if (!detected || !supported.has(detected.mime))
    throw new HttpError(
      400,
      `Unsupported media: ${name}. Use PNG, JPG, WebP, GIF, MP3, WAV, FLAC, OGG, M4A, MP4 or WebM.`,
    );
  let mime = detected.mime;
  if (/\.(m4a|m4b)$/i.test(name) && mime === "video/mp4") mime = "audio/mp4";
  const asset: Asset = {
    id,
    name,
    filename: path.basename(filename),
    mime,
    type: mime.split("/")[0] as Asset["type"],
    size: info.size,
  };
  if (asset.type !== "image" && (await findExecutable("ffprobe"))) {
    const metadata = await probeMediaFile(filename);
    if (Number.isFinite(metadata.duration) && metadata.duration > 0)
      asset.duration = metadata.duration;
  }
  return asset;
}
app.post(
  "/api/projects/:id/assets",
  async (req, res, next) => {
    try {
      requireIdle(req.params.id);
      await store.read(req.params.id);
      next();
    } catch (e) {
      next(e);
    }
  },
  (req, res, next) =>
    upload.array("files")(req, res, (error) => {
      if (error) return next(new HttpError(400, error.message));
      next();
    }),
  async (req, res) => {
    const files = req.files as Express.Multer.File[];
    const moved: string[] = [];
    let reserved = false;
    try {
      requireIdle(req.params.id);
      importing.add(req.params.id);
      reserved = true;
      if (!files?.length)
        throw new HttpError(400, "Choose at least one media file");
      const assets: Asset[] = [];
      for (const file of files) {
        const id = randomUUID();
        const asset = await identifyAsset(
          file.path,
          path.basename(file.originalname),
          id,
        );
        const detected = await fileTypeFromFile(file.path);
        asset.filename = `${id}.${detected!.ext}`;
        const destination = path.join(
          store.directory(req.params.id),
          "assets",
          asset.filename,
        );
        if ((await lstat(path.dirname(destination))).isSymbolicLink())
          throw new HttpError(400, "Media directory links are not supported");
        await rename(file.path, destination);
        moved.push(destination);
        assets.push(asset);
      }
      res.status(201).json(
        await store.update(req.params.id, (p) => {
          p.assets.push(...assets);
        }),
      );
    } catch (error) {
      await Promise.all(moved.map((f) => unlink(f).catch(() => {})));
      throw error;
    } finally {
      if (reserved) importing.delete(req.params.id);
      await Promise.all(
        (files || []).map((f) => unlink(f.path).catch(() => {})),
      );
    }
  },
);
app.get("/api/projects/:id/assets/:assetId", async (req, res) => {
  const p = await store.read(req.params.id);
  const asset = p.assets.find((a) => a.id === req.params.assetId);
  if (!asset || path.basename(asset.filename) !== asset.filename)
    throw new HttpError(404, "Asset not found");
  const filename = path.join(store.directory(p.id), "assets", asset.filename);
  if ((await lstat(path.dirname(filename))).isSymbolicLink())
    throw new HttpError(400, "Media directory links are not supported");
  if ((await lstat(filename)).isSymbolicLink())
    throw new HttpError(400, "Asset links are not supported");
  res.type(asset.mime).sendFile(filename);
});
app.post("/api/projects/:id/references", async (req, res) => {
  const id = req.params.id;
  const { url, platform } = validateReferenceUrl(
    z.string().max(2048).parse(req.body.url),
  );
  const referenceId = randomUUID();
  const project = await store.update(id, (p) => {
    requireAvailable(id);
    if (p.references.length >= 5)
      throw new HttpError(400, "Each project can have up to five references");
    if (p.references.some((r) => r.url === url))
      throw new HttpError(400, "This reference is already in the project");
    p.references.push({ id: referenceId, url, platform, status: "queued" });
  });
  const job = addJob(id, "reference");
  res.status(202).json({ job, project });
  void ingestReference(id, referenceId, job);
});
async function ingestReference(id: string, referenceId: string, job: Job) {
  job.status = "running";
  try {
    const p = await store.read(id);
    await processReference(
      store.directory(id),
      p.references.find((r) => r.id === referenceId)!,
      async (patch) => {
        await store.update(id, (current) => {
          const reference = current.references.find(
            (r) => r.id === referenceId,
          )!;
          Object.assign(reference, patch);
        });
      },
    );
    job.status = "done";
  } catch (error) {
    job.status = "error";
    job.error = message(error);
    await store.update(id, (p) => {
      Object.assign(p.references.find((r) => r.id === referenceId)!, {
        status: "error",
        error: job.error,
      });
    });
  }
}
app.post(
  "/api/projects/:id/references/:referenceId/retry",
  async (req, res) => {
    const p = await store.read(req.params.id);
    const ref = p.references.find((r) => r.id === req.params.referenceId);
    if (!ref) throw new HttpError(404, "Reference not found");
    if (ref.status !== "error")
      throw new HttpError(409, "Only failed references can be retried");
    await store.update(p.id, (p) => {
      requireAvailable(p.id);
      const r = p.references.find((r) => r.id === ref.id)!;
      r.status = "queued";
      delete r.error;
    });
    const job = addJob(p.id, "reference");
    res.status(202).json(job);
    void ingestReference(p.id, ref.id, job);
  },
);
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) throw new HttpError(404, "Job not found");
  res.json(job);
});
app.post("/api/projects/:id/export", async (req, res) => {
  requireIdle(req.params.id);
  const p = await store.read(req.params.id);
  requireIdle(p.id);
  if (!p.document.layers.length)
    throw new HttpError(400, "Add something to the video before exporting");
  if (
    [...jobs.values()].some(
      (j) =>
        j.projectId === p.id &&
        j.type === "export" &&
        ["queued", "running"].includes(j.status),
    )
  )
    throw new HttpError(409, "An export is already running");
  const job = addJob(p.id, "export");
  res.status(202).json(job);
  void (async () => {
    job.status = "running";
    try {
      const result = await renderComposition(
        store.directory(p.id),
        p.document,
        p.assets,
        (text) => {
          job.message = message(new Error(text));
        },
      );
      exportPaths.set(job.id, result.path);
      job.status = "done";
      job.url = `/api/jobs/${job.id}/download`;
    } catch (error) {
      job.status = "error";
      job.error = message(error);
    }
  })();
});
app.get("/api/jobs/:id/download", (req, res) => {
  const filename = exportPaths.get(req.params.id);
  if (!filename) throw new HttpError(404, "Export not found");
  res.download(filename, "short-it.mp4");
});

async function importAgentAssets(project: Project) {
  const directory = path.join(store.directory(project.id), "assets");
  if ((await lstat(directory)).isSymbolicLink())
    throw new HttpError(400, "Media directory links are not supported");
  const additions: Asset[] = [];
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile() || project.assets.some((a) => a.filename === file.name))
      continue;
    const id = path.parse(file.name).name;
    if (!/^[\w-]{1,100}$/.test(id) || project.assets.some((a) => a.id === id))
      continue;
    try {
      additions.push(
        await identifyAsset(path.join(directory, file.name), file.name, id),
      );
    } catch {
      /* Unrecognized sidecars are not media assets. */
    }
  }
  return additions;
}
app.get("/api/projects/:id/chat", async (req, res) => {
  const id = safeId(req.params.id);
  const active = running.has(id);
  const project = await store.read(id);
  res.json({
    text: "",
    status: "",
    ...chatStates.get(id),
    running: active || running.has(id),
    project,
  });
});
app.post("/api/projects/:id/chat", async (req, res) => {
  const id = req.params.id;
  requireIdle(id);
  const body = z
    .object({
      message: z.string().trim().min(1).max(50000),
      engine: z.enum(["codex", "claude"]),
      model: z.string().max(150).optional(),
      effort: z.string().max(30).optional(),
      assetIds: z.array(z.string()).max(100).default([]),
    })
    .parse(req.body);
  const initial = await store.read(id);
  requireIdle(id);
  if (
    body.assetIds.some(
      (assetId) => !initial.assets.some((a) => a.id === assetId),
    )
  )
    throw new HttpError(400, "Unknown attachment");
  const controller = new AbortController();
  running.set(id, controller);
  const state: { text: string; status: string; error?: string } = {
    text: "",
    status: "Getting ready...",
  };
  chatStates.set(id, state);
  if (chatStates.size > 1000)
    for (const key of chatStates.keys()) {
      if (!running.has(key)) chatStates.delete(key);
      if (chatStates.size <= 1000) break;
    }
  store.guard(initial);
  try {
    await atomicJson(
      path.join(store.directory(id), "document.json"),
      initial.document,
    );
    await store.update(id, (p) => {
      p.messages.push({
        id: randomUUID(),
        role: "user",
        content: body.message,
        createdAt: new Date().toISOString(),
        assetIds: body.assetIds,
      });
    });
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    const emit = (event: AgentEvent | { type: "done"; project: Project }) => {
      if (event.type === "text") state.text += event.text;
      if (event.type === "status") state.status = event.text;
      if (event.type === "error") {
        state.error = event.error;
        state.status = "Failed";
      }
      if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": keepalive\n\n");
    }, 15000);
    try {
      const contract = await readFile(
        path.join(appRoot, "docs", "agent-contract.md"),
        "utf8",
      );
      const systemPrompt = `${contract}\nCurrent project media: ${JSON.stringify(initial.assets)}\nReferences: ${JSON.stringify(initial.references)}\nAttached assets: ${JSON.stringify(body.assetIds)}\nRecent conversation: ${JSON.stringify(initial.messages.slice(-12))}`;
      const result = await runAgent(
        {
          engine: body.engine,
          prompt: body.message,
          systemPrompt,
          cwd: store.directory(id),
          sessionId: initial.sessions?.[body.engine],
          model: body.model || undefined,
          effort: body.effort || undefined,
        },
        emit,
        controller.signal,
      );
      if (result.ok && !result.cancelled)
        emit({ type: "status", text: "Validating and saving your edit..." });
      let generated: Project["document"] | undefined;
      let additions: Asset[] = [];
      if (result.ok && !result.cancelled) {
        try {
          additions = await importAgentAssets(initial);
          const documentPath = path.join(store.directory(id), "document.json");
          if ((await lstat(documentPath)).isSymbolicLink())
            throw new HttpError(400, "Document links are not supported");
          const candidate = documentSchema.parse(
            JSON.parse(await readFile(documentPath, "utf8")),
          );
          validateAssetReferences(candidate, {
            ...initial,
            assets: [...initial.assets, ...additions],
          });
          generated = candidate;
        } catch (error) {
          emit({
            type: "error",
            error: `The agent produced an invalid edit. Your previous video is safe. ${message(error)}`,
          });
          await atomicJson(
            path.join(store.directory(id), "document.json"),
            initial.document,
          );
        }
      } else {
        await atomicJson(
          path.join(store.directory(id), "document.json"),
          initial.document,
        );
      }
      const finalText = generated
        ? result.text
        : result.cancelled
          ? "Generation stopped. No edit was applied; your previous video is unchanged."
          : `Generation failed. No edit was applied; your previous video is unchanged. ${state.error || "The assistant did not complete successfully."}`;
      const project = await store.update(id, (p) => {
        if (result.sessionId) {
          p.sessions ??= {};
          p.sessions[body.engine] = result.sessionId;
        }
        if (generated) {
          p.document = generated;
          p.assets.push(...additions);
        }
        if (finalText)
          p.messages.push({
            id: randomUUID(),
            role: "assistant",
            content: finalText,
            createdAt: new Date().toISOString(),
          });
      });
      state.status = generated
        ? "Completed"
        : result.cancelled
          ? "Stopped"
          : "Failed";
      emit({ type: "done", project });
    } catch (error) {
      await atomicJson(
        path.join(store.directory(id), "document.json"),
        initial.document,
      );
      const failure = `Generation failed. No edit was applied; your previous video is unchanged. ${message(error)}`;
      emit({ type: "error", error: failure });
      const project = await store.update(id, (p) => {
        p.messages.push({
          id: randomUUID(),
          role: "assistant",
          content: failure,
          createdAt: new Date().toISOString(),
        });
      });
      emit({ type: "done", project });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  } catch (error) {
    state.error = message(error);
    state.status = "Failed";
    throw error;
  } finally {
    store.unguard(id);
    running.delete(id);
    state.text = "";
  }
});
app.post("/api/projects/:id/cancel", (req, res) => {
  running.get(safeId(req.params.id))?.abort();
  res.json({ ok: true });
});
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
if (args.includes("--dev")) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: appRoot,
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(appRoot, "dist")));
  app.use((_req, res) =>
    res.sendFile(path.join(appRoot, "dist", "index.html")),
  );
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (res.headersSent) return;
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 500;
    res.status(status).json({ error: message(error) });
  },
);
server.listen(port, "127.0.0.1", () =>
  console.log(`short.it · http://127.0.0.1:${port}`),
);
server.on("error", (error) => {
  console.error(message(error));
  process.exitCode = 1;
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  for (const controller of running.values()) controller.abort();
  const wait = setInterval(() => {
    if (!running.size) {
      clearInterval(wait);
      process.exit(0);
    }
  }, 100);
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
