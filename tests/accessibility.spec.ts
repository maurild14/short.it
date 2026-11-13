import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Project } from "../src/shared/types";

test("dashboard and empty editor meet WCAG AA checks", async ({
  page,
  request,
}) => {
  const scan = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // Video artwork has its own creative colors; audit the surrounding product UI.
      .exclude(".canvas-stage")
      .analyze();

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "All projects" }),
  ).toBeVisible();
  expect((await scan()).violations).toEqual([]);

  const response = await request.post("/api/projects", {
    data: { name: "Accessibility fixture" },
  });
  expect(response.ok()).toBeTruthy();
  const project: Project = await response.json();
  await page.goto(`/#project=${project.id}`);
  await expect(
    page.getByRole("heading", { name: "Creative assistant" }),
  ).toBeVisible();
  expect((await scan()).violations).toEqual([]);
});
