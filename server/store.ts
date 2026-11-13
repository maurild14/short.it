import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  newDocument,
  type Project,
  type VideoDocument,
} from "../src/shared/types.ts";

const number = z.number().finite();
const color = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
export const documentSchema = z
  .object({
    version: z.literal(1),
    width: number.int().min(64).max(4096),
    height: number.int().min(64).max(4096),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]),
    duration: number.positive().max(3600),
    background: color,
    layers: z
      .array(
        z.object({
          id: z.string().regex(/^[\w-]{1,100}$/),
          name: z.string().max(200),
          type: z.enum(["text", "image", "video", "audio", "shape"]),
          start: number.min(0),
          duration: number.positive().max(3600),
          track: number.int().min(0).max(1000),
          x: number.min(-10000).max(10000),
          y: number.min(-10000).max(10000),
          width: number.positive().max(10000),
          height: number.positive().max(10000),
          rotation: number.min(-3600).max(3600),
          opacity: number.min(0).max(1),
          assetId: z
            .string()
            .regex(/^[\w-]{1,100}$/)
            .optional(),
          text: z.string().max(20000).optional(),
          fontSize: number.min(1).max(1000).optional(),
          fontFamily: z
            .string()
            .regex(/^[\w ,'-]{1,120}$/)
            .optional(),
          fontWeight: number.int().min(100).max(900).optional(),
          color: color.optional(),
          background: color.optional(),
          borderRadius: number.min(0).max(5000).optional(),
          volume: number.min(0).max(1).optional(),
          trimStart: number.min(0).max(86400).optional(),
          fadeIn: number.min(0).max(3600).optional(),
          fadeOut: number.min(0).max(3600).optional(),
          locked: z.boolean().optional(),
          hidden: z.boolean().optional(),
        }),
      )
      .max(500),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    doc.layers.forEach((layer, index) => {
      if (ids.has(layer.id))
        ctx.addIssue({
          code: "custom",
          path: ["layers", index, "id"],
          message: "Duplicate layer ID",
        });
      ids.add(layer.id);
      if (layer.start + layer.duration > doc.duration + 0.001)
        ctx.addIssue({
          code: "custom",
          path: ["layers", index, "duration"],
          message: "Layer extends beyond video duration",
        });
      if (["audio", "image", "video"].includes(layer.type) && !layer.assetId)
        ctx.addIssue({
          code: "custom",
          path: ["layers", index, "assetId"],
          message: "A media layer needs an asset",
        });
    });
  });

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw new HttpError(400, "Invalid identifier");
  return id;
}
export async function atomicJson(filename: string, value: unknown) {
  const temp = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { flag: "wx" });
  await rename(temp, filename);
}
export class ProjectStore {
  private queues = new Map<string, Promise<unknown>>();
  private guarded = new Map<string, Project>();
  constructor(public root: string) {
    this.root = path.resolve(root);
  }
  directory(id: string) {
    return path.join(this.root, safeId(id));
  }
  async init() {
    await mkdir(this.root, { recursive: true });
  }
  guard(project: Project) {
    this.guarded.set(project.id, structuredClone(project));
  }
  unguard(id: string) {
    this.guarded.delete(id);
  }
  async read(id: string): Promise<Project> {
    const directory = this.directory(id);
    const accepted = this.guarded.get(id);
    if (accepted) return structuredClone(accepted);
    try {
      if ((await lstat(directory)).isSymbolicLink())
        throw new HttpError(400, "Project links are not supported");
      if ((await lstat(path.join(directory, "project.json"))).isSymbolicLink())
        throw new HttpError(400, "Project file links are not supported");
      return JSON.parse(
        await readFile(path.join(directory, "project.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new HttpError(404, "Project not found");
      throw error;
    }
  }
  async list() {
    await this.init();
    const projects: Project[] = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[\w-]+$/.test(entry.name)) continue;
      try {
        projects.push(await this.read(entry.name));
      } catch {
        /* A foreign directory is not a project. */
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async recoverInterruptedReferences() {
    for (const project of await this.list()) {
      if (
        !project.references.some(
          (r) => r.status !== "ready" && r.status !== "error",
        )
      )
        continue;
      await this.update(project.id, (p) => {
        for (const reference of p.references)
          if (reference.status !== "ready" && reference.status !== "error") {
            reference.status = "error";
            reference.error =
              "Processing was interrupted. Retry to continue using the files already saved.";
          }
      });
    }
  }
  async create(name: string) {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      assets: [],
      references: [],
      messages: [],
      document: newDocument(),
    };
    const dir = this.directory(project.id);
    await mkdir(path.join(dir, "assets"), { recursive: true });
    await mkdir(path.join(dir, "transcripciones"));
    await atomicJson(path.join(dir, "document.json"), project.document);
    await atomicJson(path.join(dir, "project.json"), project);
    return project;
  }
  async update(
    id: string,
    mutate: (project: Project) => void | Promise<void>,
  ): Promise<Project> {
    safeId(id);
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const project = await this.read(id);
        await mutate(project);
        project.revision++;
        project.updatedAt = new Date().toISOString();
        await atomicJson(
          path.join(this.directory(id), "project.json"),
          project,
        );
        if (this.guarded.has(id))
          this.guarded.set(id, structuredClone(project));
        return project;
      });
    this.queues.set(id, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(id) === next) this.queues.delete(id);
    }
  }
}
export function validateAssetReferences(
  document: VideoDocument,
  project: Project,
) {
  for (const layer of document.layers) {
    if (
      layer.assetId &&
      !project.assets.some(
        (a) => a.id === layer.assetId && a.type === layer.type,
      )
    )
      throw new HttpError(
        400,
        `Missing or incompatible asset for ${layer.name}`,
      );
  }
}
