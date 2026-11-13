import { expect, test } from "@playwright/test";
import type { Project } from "../src/shared/types";

test("generation survives navigation and reload, and only Stop cancels it", async ({
  page,
  request,
}) => {
  const project: Project = await (
    await request.post("/api/projects", {
      data: { name: "Background generation fixture" },
    })
  ).json();
  let running = true;
  let cancellations = 0;
  let text = "Building the opening scene";
  await page.route(`**/api/projects/${project.id}/chat`, async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      json: { running, text, status: "Editing video…", project },
    });
  });
  await page.route(`**/api/projects/${project.id}/cancel`, async (route) => {
    cancellations++;
    running = false;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/#project=${project.id}`);
  const stop = page.getByRole("button", {
    name: "Stop generating",
    exact: true,
  });
  await expect(stop).toBeVisible();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Back to projects", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All projects", exact: true }),
  ).toBeVisible();
  expect(cancellations).toBe(0);
  text = "Building the next scene in the background";
  await page.goBack();
  await expect(stop).toBeVisible();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.reload();
  await expect(stop).toBeVisible();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  expect(cancellations).toBe(0);
  await stop.click();
  await expect(stop).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeVisible();
  expect(cancellations).toBe(1);
});

test("a recovered generation delivers its completed result without another prompt", async ({
  page,
  request,
}) => {
  const project: Project = await (
    await request.post("/api/projects", {
      data: { name: "Background completion fixture" },
    })
  ).json();
  let running = true;
  await page.route(`**/api/projects/${project.id}/chat`, async (route) => {
    await route.fulfill({
      json: {
        running,
        text: running ? "Working on the ending" : "",
        status: running ? "Editing…" : "Completed",
        project,
      },
    });
  });
  await page.goto(`/#project=${project.id}`);
  await expect(
    page.getByRole("button", { name: "Stop generating", exact: true }),
  ).toBeVisible();
  project.messages.push({
    id: "completed",
    role: "assistant",
    content: "The finished edit is ready",
    createdAt: new Date().toISOString(),
  });
  project.revision++;
  running = false;
  await expect(
    page.getByText("The finished edit is ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop generating", exact: true }),
  ).toHaveCount(0);
});

test("a background completion preserves unsaved local edits", async ({
  page,
  request,
}) => {
  const project: Project = await (
    await request.post("/api/projects", {
      data: { name: "Background conflict fixture" },
    })
  ).json();
  let running = false;
  await page.route(`**/api/projects/${project.id}/chat`, async (route) => {
    await route.fulfill({
      json: { running, text: "", status: "Working", project },
    });
  });
  await page.route(`**/api/projects/${project.id}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 409,
        json: { error: "Another window is generating" },
      });
    else await route.continue();
  });
  await page.goto(`/#project=${project.id}`);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Keep my unsaved edit");
  running = true;
  await expect(
    page.getByRole("button", { name: "Stop generating", exact: true }),
  ).toBeVisible();
  project.revision++;
  running = false;
  await expect(
    page.getByText(/The assistant finished, but you have unsaved edits/),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Text", exact: true })).toHaveValue(
    "Keep my unsaved edit",
  );
});
