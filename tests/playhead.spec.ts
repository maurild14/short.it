import { expect, test } from "@playwright/test";

for (const mobile of [false, true]) {
  test.describe(mobile ? "touch timeline" : "mouse timeline", () => {
    test.use({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
    });
    test("seeks at the clicked position after scroll and zoom without seeking on clip drag", async ({
      page,
      request,
    }) => {
      const project = await (
        await request.post("/api/projects", {
          data: { name: "Playhead fixture" },
        })
      ).json();
      const document = {
        ...project.document,
        duration: 60,
        layers: [
          {
            id: "clip",
            name: "Long clip",
            type: "shape",
            start: 0,
            duration: 60,
            track: 0,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
          },
        ],
      };
      await request.put(`/api/projects/${project.id}`, {
        data: { document, revision: project.revision },
      });
      await page.goto(`/#project=${project.id}`);
      if (mobile)
        await page
          .getByRole("button", { name: "Open video editor", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Zoom in timeline", exact: true })
        .click();
      const scroll = page.locator(".timeline-scroll");
      await scroll.evaluate((element) => {
        element.scrollLeft = 700;
      });
      const bounds = (await scroll.boundingBox())!;
      const clip = (await page.locator(".timeline-clip").boundingBox())!;
      const x = bounds.x + 210;
      const y = clip.y + clip.height / 2;
      if (mobile) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      const playhead = page.locator(".playhead");
      await expect
        .poll(async () => Math.abs((await playhead.boundingBox())!.x - x))
        .toBeLessThan(1);
      const lane = (await page.locator(".track-lane").boundingBox())!;
      if (mobile) await page.touchscreen.tap(x + 30, lane.y + lane.height - 2);
      else await page.mouse.click(x + 30, lane.y + lane.height - 2);
      await expect
        .poll(async () => Math.abs((await playhead.boundingBox())!.x - x - 30))
        .toBeLessThan(1);
      const before = await page
        .getByRole("slider", { name: "Playback position" })
        .getAttribute("aria-valuenow");
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 20, y, { steps: 5 });
      await page.mouse.up();
      await expect(
        page.getByRole("slider", { name: "Playback position" }),
      ).toHaveAttribute("aria-valuenow", before!);
      const handle = (await page
        .getByRole("slider", { name: "Playback position" })
        .boundingBox())!;
      await page.mouse.move(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(x + 60, handle.y + handle.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect
        .poll(async () => Math.abs((await playhead.boundingBox())!.x - x - 60))
        .toBeLessThan(1);
    });
  });
}
