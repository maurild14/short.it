import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import type { Project } from "../src/shared/types";

async function fixture(request: APIRequestContext) {
  const project: Project = await (
    await request.post("/api/projects", { data: { name: "Selection fixture" } })
  ).json();
  const document = {
    ...project.document,
    width: 1000,
    height: 600,
    duration: 10,
    layers: [100, 400, 700].map((x, index) => ({
      id: `shape-${index}`,
      name: `Shape ${index + 1}`,
      type: "shape",
      start: 1,
      duration: 3,
      track: index + 1,
      x,
      y: 100,
      width: 120,
      height: 100,
      rotation: 0,
      opacity: 1,
      background: "#4d7dff",
      locked: index === 2,
    })),
  };
  await request.put(`/api/projects/${project.id}`, {
    data: { document, revision: project.revision },
  });
  return project.id;
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test("canvas marquee moves a group as one undo step and preserves locked layers", async ({
  page,
  request,
}) => {
  const id = await fixture(request);
  const read = async (): Promise<Project> =>
    (await request.get(`/api/projects/${id}`)).json();
  await page.goto(`/#project=${id}`);
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeVisible();
  // Seek into the clips using the ruler; artwork is not visible at time zero.
  const ruler = await page.locator(".ruler").boundingBox();
  await page.mouse.click(ruler!.x + 66, ruler!.y + 10);
  await expect(page.locator(".canvas-layer")).toHaveCount(3);
  const stage = (await page.locator(".canvas-stage").boundingBox())!;
  const factor = stage.width / 1000;
  await drag(
    page,
    { x: stage.x + 30 * factor, y: stage.y + 30 * factor },
    { x: stage.x + 550 * factor, y: stage.y + 230 * factor },
  );
  await expect(page.locator(".canvas-layer.selected")).toHaveCount(2);
  await expect(page.locator(".timeline-clip.selected")).toHaveCount(2);
  const first = (await page
    .locator('.canvas-layer[data-selection-id="shape-0"]')
    .boundingBox())!;
  await drag(
    page,
    { x: first.x + first.width / 2, y: first.y + first.height / 2 },
    { x: first.x + first.width / 2 + 20, y: first.y + first.height / 2 + 10 },
  );
  await expect
    .poll(async () => (await read()).document.layers[0].x)
    .toBe(100 + Math.round(20 / factor));
  const moved = (await read()).document.layers;
  expect(moved[1].x - moved[0].x).toBe(300);
  expect(moved[2].x).toBe(700);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await read()).document.layers[0].x).toBe(100);
  await expect.poll(async () => (await read()).document.layers[1].x).toBe(400);
  await page.keyboard.press("Control+a");
  await expect(page.locator(".canvas-layer.selected")).toHaveCount(3);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await read()).document.layers[0].x).toBe(101);
  expect((await read()).document.layers[2].x).toBe(700);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await read()).document.layers.length).toBe(5);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await read()).document.layers.length).toBe(3);
});

test("timeline marquee, additive click and group move preserve relative timing", async ({
  page,
  request,
}) => {
  const id = await fixture(request);
  const read = async (): Promise<Project> =>
    (await request.get(`/api/projects/${id}`)).json();
  await page.goto(`/#project=${id}`);
  const first = page.locator('.timeline-clip[data-selection-id="shape-0"]');
  const second = page.locator('.timeline-clip[data-selection-id="shape-1"]');
  await expect(first).toBeVisible();
  const a = (await first.boundingBox())!,
    b = (await second.boundingBox())!;
  await drag(
    page,
    { x: a.x + a.width + 15, y: a.y + a.height + 3 },
    { x: b.x - 10, y: b.y - 3 },
  );
  await expect(page.locator(".timeline-clip.selected")).toHaveCount(2);
  await drag(
    page,
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: a.x + a.width / 2 + 44, y: a.y + a.height / 2 },
  );
  await expect
    .poll(async () => (await read()).document.layers[0].start)
    .toBe(2);
  expect((await read()).document.layers[1].start).toBe(2);
  expect((await read()).document.layers[2].start).toBe(1);
  await first.click();
  await expect(page.locator(".timeline-clip.selected")).toHaveCount(1);
  await second.click({ modifiers: ["Shift"] });
  await expect(page.locator(".timeline-clip.selected")).toHaveCount(2);
  await second.click({ modifiers: ["Shift"] });
  await expect(page.locator(".timeline-clip.selected")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".timeline-clip.selected")).toHaveCount(0);
});
