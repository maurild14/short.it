import { expect, test } from "@playwright/test";

test("1036 layers load, duplicate, save and reload without the old cap", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: "Large document fixture" },
    })
  ).json();
  const document = {
    ...project.document,
    duration: 60,
    layers: Array.from({ length: 1036 }, (_, i) => ({
      id: `layer-${i}`,
      name: `Shape ${i}`,
      type: "shape",
      track: i % 3,
      start: i % 60,
      duration: 1,
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      rotation: 0,
      opacity: 1,
      background: "#ffffff",
    })),
  };
  const save = await request.put(`/api/projects/${project.id}`, {
    data: { document, revision: project.revision },
  });
  expect(save.ok()).toBe(true);
  await page.goto(`/#project=${project.id}`);
  await expect(page.locator(".timeline-clip")).toHaveCount(1036);
  await page.locator('.timeline-clip[data-selection-id="layer-0"]').focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Duplicate element", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/projects/${project.id}`)).json())
          .document.layers.length,
    )
    .toBe(1037);
  await page.reload();
  await expect(page.locator(".timeline-clip")).toHaveCount(1037);
});
