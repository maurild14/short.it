import { test, expect } from "@playwright/test";

for (const fallback of [false, true]) {
  test(`preview fullscreen opens and exits${fallback ? " when the browser denies native fullscreen" : " natively"}`, async ({
    page,
    request,
  }) => {
    if (fallback)
      await page.addInitScript(() => {
        HTMLElement.prototype.requestFullscreen = () =>
          Promise.reject(new Error("Denied by host"));
      });
    const project = await (
      await request.post("/api/projects", {
        data: { name: "Fullscreen fixture" },
      })
    ).json();
    await page.goto(`/#project=${project.id}`);
    await page
      .getByRole("button", { name: "Fullscreen preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Exit fullscreen preview",
        exact: true,
      }),
    ).toBeVisible();
    if (fallback) {
      await expect(page.locator(".preview-panel")).toHaveClass(
        /preview-expanded/,
      );
      const bounds = await page.locator(".preview-panel").boundingBox();
      expect(bounds?.width).toBe(page.viewportSize()?.width);
      await page.keyboard.press("Escape");
    } else {
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement?.className))
        .toContain("preview-panel");
      await page
        .getByRole("button", { name: "Exit fullscreen preview", exact: true })
        .click();
    }
    await expect(
      page.getByRole("button", { name: "Fullscreen preview", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".preview-panel")).not.toHaveClass(
      /preview-expanded/,
    );
    await expect(
      page.getByRole("button", { name: "Back to projects", exact: true }),
    ).toBeEnabled();
  });
}
