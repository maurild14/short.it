import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Project } from "../src/shared/types";

test("organize projects, reload folders, move out, and delete without losing unrelated work", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `Library ${Date.now()}`;
  const project: Project = await (
    await request.post("/api/projects", { data: { name } })
  ).json();
  await page.goto("/");
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name, exact: true, level: 2 }),
  ).toBeVisible();
  await expect(page.locator(".project-tile")).toHaveCount(0);
  const folderHash = new URL(page.url()).hash;
  await page.reload();
  await expect(
    page.getByRole("heading", { name, exact: true, level: 2 }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: /^Projects/ })
    .click();
  const options = page.getByRole("button", {
    name: `Options for ${name}`,
    exact: true,
  });
  await options.focus();
  await options.press("Enter");
  await options.press("Tab");
  await expect(
    page.getByRole("button", { name: "Move to folder", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await options.click();
  await page
    .getByRole("button", { name: "Move to folder", exact: true })
    .click();
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption({ label: name });
  await page.getByRole("button", { name: "Move project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(options).toBeFocused();
  await page.getByTitle(name, { exact: true }).click();
  await expect(
    page.getByRole("button").filter({
      has: page.getByRole("heading", { name, exact: true, level: 3 }),
    }),
  ).toBeVisible();
  await page.reload();
  await expect(options).toBeVisible();
  await options.click();
  await page
    .getByRole("button", { name: "Move to folder", exact: true })
    .click();
  await page.getByLabel("Destination").selectOption("");
  await page.getByRole("button", { name: "Move project", exact: true }).click();
  await expect(options).toHaveCount(0);
  expect(
    (await (await request.get(`/api/projects/${project.id}`)).json()).folderId,
  ).toBeUndefined();

  // New projects inherit the current folder, and removing that folder preserves their work.
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill(`${name} in folder`);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Back to projects", exact: true }),
  ).toBeVisible();
  const createdId = new URLSearchParams(new URL(page.url()).hash.slice(1)).get(
    "project",
  );
  expect(
    (await (await request.get(`/api/projects/${createdId}`)).json()).folderId,
  ).toBe(folderHash.slice(8));
  await page
    .getByRole("button", { name: "Back to projects", exact: true })
    .click();
  await page.getByTitle(name, { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name, exact: true, level: 2 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All projects", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button").filter({
      has: page.getByRole("heading", {
        name: `${name} in folder`,
        exact: true,
        level: 3,
      }),
    }),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/projects/${createdId}`)).json()).folderId,
  ).toBeUndefined();

  await options.click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(options).toBeVisible();
  await options.click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(options).toHaveCount(0);
  await page.reload();
  await expect(options).toHaveCount(0);
  expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(404);
  expect((await request.get(`/api/projects/${createdId}`)).status()).toBe(200);
  expect(errors).toEqual([]);
});

test("errors remain visible and busy deletion cannot be dismissed or submitted twice", async ({
  page,
  request,
}) => {
  const name = `Protected ${Date.now()}`;
  await request.post("/api/projects", { data: { name } });
  await page.goto("/");
  await page.getByRole("button", { name: `Options for ${name}` }).click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/projects/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    requests++;
    await pending;
    await route.fulfill({
      status: 409,
      json: {
        error:
          "Wait for the current operation to finish before deleting this project.",
      },
    });
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Wait for the current operation",
  );
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button").filter({
      has: page.getByRole("heading", { name, exact: true, level: 3 }),
    }),
  ).toBeVisible();
});

test("folder controls work on narrow screens and dialogs meet WCAG AA", async ({
  page,
  request,
}) => {
  const name = `Mobile ${Date.now()}`;
  const folder = await (
    await request.post("/api/folders", { data: { name } })
  ).json();
  await request.post("/api/projects", { data: { name, folderId: folder.id } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByLabel("View projects", { exact: true })
    .selectOption(folder.id);
  await expect(
    page.getByRole("heading", { name, exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button").filter({
      has: page.getByRole("heading", { name, exact: true, level: 3 }),
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const scan = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole("button", { name: `Options for ${name}` }).click();
  expect((await scan()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Move to folder", exact: true })
    .click();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: `Options for ${name}` }).click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  expect((await scan()).violations).toEqual([]);
});
