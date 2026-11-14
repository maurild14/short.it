import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  ProjectStore,
  documentSchema,
  validateAssetReferences,
  safeId,
} from "./store.ts";
import { MAX_LAYERS, newDocument } from "../src/shared/types.ts";

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
