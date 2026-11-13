import { expect, test, type Locator, type Page } from "@playwright/test";

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test("editor panels resize by dragging and keyboard, persist, and reset", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: "Panel layout fixture" },
    })
  ).json();
  await page.goto(`/#project=${project.id}`);
  const chat = page.getByRole("separator", { name: "Resize assistant panel" });
  const inspector = page.getByRole("separator", {
    name: "Resize properties panel",
  });
  const timeline = page.getByRole("separator", {
    name: "Resize timeline",
    exact: true,
  });
  await expect(chat).toBeVisible();
  const widthBefore = (await page.locator(".left-panel").boundingBox())!.width;
  await drag(page, chat, 80, 0);
  await expect
    .poll(async () => (await page.locator(".left-panel").boundingBox())!.width)
    .toBeCloseTo(widthBefore + 80, 0);
  const inspectorBefore = (await page.locator(".inspector").boundingBox())!
    .width;
  await drag(page, inspector, -50, 0);
  await expect
    .poll(async () => (await page.locator(".inspector").boundingBox())!.width)
    .toBeCloseTo(inspectorBefore + 50, 0);
  const heightBefore = (await page.locator(".timeline-panel").boundingBox())!
    .height;
  await drag(page, timeline, 0, -70);
  await expect
    .poll(
      async () => (await page.locator(".timeline-panel").boundingBox())!.height,
    )
    .toBeCloseTo(heightBefore + 70, 0);
  await page.reload();
  await expect(chat).toHaveAttribute("aria-valuenow", String(widthBefore + 80));
  await expect(timeline).toHaveAttribute(
    "aria-valuenow",
    String(heightBefore + 70),
  );
  await chat.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(chat).toHaveAttribute("aria-valuenow", String(widthBefore + 70));
  await chat.press("Enter");
  await expect(chat).toHaveAttribute("aria-valuenow", "335");
  await timeline.dblclick();
  await expect(timeline).toHaveAttribute("aria-valuenow", "230");
  await inspector.press("End");
  expect(Number(await inspector.getAttribute("aria-valuenow"))).toBe(
    Number(await inspector.getAttribute("aria-valuemax")),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const prompt = page.getByLabel("Describe your video or ask for an edit", {
    exact: true,
  });
  await prompt.fill("Keep this draft while the panel is collapsed");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.locator(".left-panel")).toBeHidden();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(prompt).toHaveValue(
    "Keep this draft while the panel is collapsed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chat).toBeHidden();
  await page
    .getByRole("button", { name: "Open video editor", exact: true })
    .click();
  await expect(timeline).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
