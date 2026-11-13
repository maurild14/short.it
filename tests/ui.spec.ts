import { expect, test } from "@playwright/test";
import type { Project } from "../src/shared/types";

test("create, edit, reload, upload, mention, and undo an editable video", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `Browser smoke ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Project name", { exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Back to projects", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#project=/);
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    name,
  );
  const id = new URLSearchParams(new URL(page.url()).hash.slice(1)).get(
    "project",
  );
  expect(id).toBeTruthy();
  const read = async (): Promise<Project> =>
    (await request.get(`/api/projects/${id}`)).json();

  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("An editable idea");
  await page.getByRole("textbox", { name: "Text", exact: true }).press("Tab");
  await page.getByRole("spinbutton", { name: /^Position X/ }).fill("220");
  await page.getByRole("spinbutton", { name: /^Position X/ }).press("Tab");
  await expect
    .poll(async () => (await read()).document.layers[0]?.text)
    .toBe("An editable idea");
  await expect.poll(async () => (await read()).document.layers[0]?.x).toBe(220);
  await page.reload();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    name,
  );
  await expect(page.locator(".canvas-layer.text")).toHaveText(
    "An editable idea",
  );

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel("Attach media files", { exact: true })
    .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
  await expect.poll(async () => (await read()).assets.length).toBe(1);
  const prompt = page.getByLabel("Describe your video or ask for an edit", {
    exact: true,
  });
  await prompt.fill("@pix");
  await page
    .getByRole("listbox", { name: "Mention an asset" })
    .getByRole("option")
    .filter({ hasText: "pixel.png" })
    .click();
  await expect(prompt).toHaveValue("@pixel.png ");
  await expect(
    page.getByRole("button", { name: "Detach pixel.png", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Editor tools" })
    .getByRole("button", { name: "Media", exact: true })
    .click();
  await page.getByRole("button", { name: /pixel\.png.*image/ }).click();
  await expect.poll(async () => (await read()).document.layers.length).toBe(2);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(async () => (await read()).document.layers.length).toBe(1);
  await page
    .getByRole("button", { name: "Redo (Ctrl+Shift+Z)", exact: true })
    .click();
  await expect.poll(async () => (await read()).document.layers.length).toBe(2);
  const projectHash = new URL(page.url()).hash;
  await page
    .getByRole("link", { name: "Skip to content", exact: true })
    .focus();
  await page
    .getByRole("link", { name: "Skip to content", exact: true })
    .press("Enter");
  expect(new URL(page.url()).hash).toBe(projectHash);
  await expect(page.locator("#main-content")).toBeFocused();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "All projects", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    name,
  );
  await expect(page.locator(".canvas-layer.text")).toHaveText(
    "An editable idea",
  );
  expect(errors).toEqual([]);
});

test("upload metadata cannot authorize overwriting another window's video", async ({
  page,
  request,
}) => {
  const created: Project = await (
    await request.post("/api/projects", {
      data: { name: "Concurrent window fixture" },
    })
  ).json();
  const document = {
    ...created.document,
    duration: 2,
    layers: [
      {
        id: "title",
        name: "Title",
        type: "text",
        text: "Original video",
        start: 0,
        duration: 2,
        track: 0,
        x: 90,
        y: 700,
        width: 900,
        height: 200,
        rotation: 0,
        opacity: 1,
        fontSize: 72,
        color: "#ffffff",
      },
    ],
  };
  const accepted: Project = await (
    await request.put(`/api/projects/${created.id}`, {
      data: { document, revision: created.revision },
    })
  ).json();
  await page.goto(`/#project=${created.id}`);
  await expect(page.locator(".canvas-layer.text")).toHaveText("Original video");
  let releaseUpload!: () => void;
  let uploadStarted!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const started = new Promise<void>((resolve) => {
    uploadStarted = resolve;
  });
  await page.route(`**/api/projects/${created.id}/assets`, async (route) => {
    uploadStarted();
    await held;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.getByLabel("Attach media files", { exact: true }).setInputFiles({
    name: "window.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await started;
  const remote = {
    ...document,
    layers: document.layers.map((layer) => ({
      ...layer,
      text: "Other window's video",
    })),
  };
  const changed = await request.put(`/api/projects/${created.id}`, {
    data: { document: remote, revision: accepted.revision },
  });
  expect(changed.ok()).toBeTruthy();
  releaseUpload();
  await expect(
    page.getByRole("alert").filter({ hasText: /another window/ }),
  ).toBeVisible();
  await expect(page.locator(".canvas-layer.text")).toHaveText("Original video");
  await page.locator(".canvas-layer.text").click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Local edit after upload");
  await page.getByRole("textbox", { name: "Text", exact: true }).press("Tab");
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
  const saved: Project = await (
    await request.get(`/api/projects/${created.id}`)
  ).json();
  expect(saved.document.layers[0].text).toBe("Other window's video");
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("Local edit after upload");
});
