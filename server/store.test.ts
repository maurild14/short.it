import { test } from "node:test";
import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  ProjectStore,
  documentSchema,
  validateAssetReferences,
  safeId,
} from "./store.ts";
import { MAX_LAYERS, newDocument } from "../src/shared/types.ts";

test("folders persist, serialize moves and preserve projects when removed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "short-it-folders-"));
  try {
    const store = new ProjectStore(root);
    assert.deepEqual(await store.folders(), []);
    const [first, second] = await Promise.all([
      store.createFolder(" First "),
      store.createFolder("Second"),
    ]);
    assert.equal(first.name, "First");
    await assert.rejects(store.createFolder("first"), /already exists/);
    await assert.rejects(store.createFolder(" "));
    const project = await store.create("Organized", first.id);
    const outside = await store.create("Outside");
    await assert.rejects(store.move(project.id, "missing"), /Folder not found/);
    await assert.rejects(
      store.create("Missing folder", "missing"),
      /Folder not found/,
    );
    const moved = await store.move(project.id, second.id);
    assert.equal(moved.folderId, second.id);
    assert.deepEqual(moved.document, project.document);
    assert.equal(
      (await new ProjectStore(root).read(project.id)).folderId,
      second.id,
    );
    assert.equal((await new ProjectStore(root).folders()).length, 2);
    await store.move(project.id, null);
    assert.equal((await store.read(project.id)).folderId, undefined);
    await store.move(project.id, first.id);
    await Promise.all([
      store.removeFolder(first.id),
      store.move(project.id, second.id),
    ]);
    assert.equal((await store.read(project.id)).folderId, second.id);
    store.guard(await store.read(project.id));
    await store.removeFolder(second.id);
    assert.equal((await store.read(project.id)).folderId, undefined);
    store.unguard(project.id);
    assert.equal((await store.read(project.id)).folderId, undefined);
    assert.deepEqual((await store.read(project.id)).document, project.document);
    assert.deepEqual(await store.read(outside.id), outside);
    assert.equal((await store.list()).length, 2);
    await assert.rejects(store.removeFolder(first.id), /Folder not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deletion serializes with saves, rejects busy projects and never follows directory links", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "short-it-delete-"));
  try {
    const root = path.join(temporary, "projects");
    const store = new ProjectStore(root);
    const project = await store.create("Delete me");
    const other = await store.create("Keep me");
    store.guard(project);
    await assert.rejects(store.remove(project.id), /current operation/);
    store.unguard(project.id);
    await store.update(project.id, (p) => {
      p.references.push({
        id: "ref",
        url: "https://youtu.be/abcdefghijk",
        platform: "YouTube",
        status: "queued",
      });
    });
    await assert.rejects(store.remove(project.id), /current operation/);
    await store.update(project.id, (p) => {
      p.references[0].status = "error";
    });
    const outside = path.join(temporary, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "keep.txt"), "KEEP");
    const linked = path.join(root, "linked");
    await symlink(
      outside,
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(store.remove("linked"), /links are not supported/);
    await symlink(
      outside,
      path.join(store.directory(project.id), "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await Promise.all([
      store.update(project.id, (p) => {
        p.name = "Last save";
      }),
      store.remove(project.id),
    ]);
    await assert.rejects(access(store.directory(project.id)));
    await assert.rejects(
      store.update(project.id, (p) => {
        p.name = "Resurrect";
      }),
      /Project not found/,
    );
    await assert.rejects(store.remove("../outside"), /Invalid identifier/);
    assert.equal(
      await readFile(path.join(outside, "keep.txt"), "utf8"),
      "KEEP",
    );
    assert.deepEqual(await store.read(other.id), other);
    assert.deepEqual(
      (await store.list()).map((p) => p.id),
      [other.id],
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("large documents accept the shared layer budget and reject overflow", () => {
  const layers = Array.from({ length: MAX_LAYERS }, (_, i) => ({
    id: `layer-${i}`,
    name: "Shape",
    type: "shape",
    track: 0,
    start: 0,
    duration: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
  }));
  assert.equal(
    documentSchema.parse({ ...newDocument(), layers }).layers.length,
    MAX_LAYERS,
  );
  assert.equal(
    documentSchema.safeParse({
      ...newDocument(),
      layers: [...layers, { ...layers[0], id: "overflow" }],
    }).success,
    false,
  );
});

test("reject traversal, invalid timing and duplicate layer IDs", () => {
  assert.throws(() => safeId("../private"));
  const layer = {
    id: "a",
    name: "title",
    type: "text" as const,
    track: 0,
    start: 0,
    duration: 5,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
  };
  assert.equal(
    documentSchema.safeParse({ ...newDocument(), layers: [layer] }).success,
    true,
  );
  assert.equal(
    documentSchema.safeParse({ ...newDocument(), layers: [layer, layer] })
      .success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({
      ...newDocument(),
      layers: [{ ...layer, start: 14 }],
    }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({
      ...newDocument(),
      layers: [{ ...layer, type: "audio" }],
    }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({ ...newDocument(), background: "#12345" })
      .success,
    false,
  );
});
test("serialized writes preserve independent changes and reject absent media", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "short-it-store-"));
  try {
    const store = new ProjectStore(root);
    const p = await store.create("Test");
    await Promise.all([
      store.update(p.id, (p) => {
        p.name = "Updated";
      }),
      store.update(p.id, (p) => {
        p.messages.push({
          id: "m",
          role: "user",
          content: "hello",
          createdAt: new Date().toISOString(),
        });
      }),
    ]);
    const saved = await store.read(p.id);
    assert.equal(saved.name, "Updated");
    assert.equal(saved.messages.length, 1);
    assert.equal(saved.revision, 2);
    assert.throws(() =>
      validateAssetReferences(
        {
          ...newDocument(),
          layers: [
            {
              id: "a",
              name: "Audio",
              type: "audio",
              track: 0,
              start: 0,
              duration: 1,
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              rotation: 0,
              opacity: 1,
              assetId: "missing",
            },
          ],
        },
        saved,
      ),
    );
    assert.equal((await store.list()).length, 1);
    await store.update(p.id, (p) => {
      p.references.push({
        id: "r",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        platform: "YouTube",
        status: "extracting",
      });
    });
    await store.recoverInterruptedReferences();
    assert.equal((await store.read(p.id)).references[0].status, "error");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
