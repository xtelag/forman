import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("aligned collection toolbars and compact dashboard across widths and themes", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  for (let i = 0; i < 10; i++) {
    const response = await page.request.post("/api/admin/v1/examples", {
      data: { kind: "form", requestId: randomUUID() },
      headers: { origin: "http://localhost:3100" },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.route("**/api/admin/v1/tags", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "long-1",
            name: "Customer support and international enquiries",
            color: "blue",
          },
          { id: "long-2", name: "Marketing", color: "violet" },
          { id: "long-3", name: "Internal requests", color: "teal" },
        ],
      },
    }),
  );
  await page.route("**/api/admin/v1/dashboard", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (data.summary.recentSubmissions.length) {
      data.summary.recentSubmissions[0].sourceName =
        "International customer support and advertising enquiries";
    }
    await route.fulfill({ json: data });
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const path of [
      "inbox",
      "submissions",
      "pipeline-runs",
      "callbacks",
      "sources",
      "pages",
      "pipelines",
    ]) {
      await page.goto("/app/" + path);
      const search = page.getByRole("textbox", { name: "Search", exact: true });
      const filters = page.getByRole("button", {
        name: "Filters",
        exact: true,
      });
      await expect(search).toBeVisible();
      await expect(
        page.getByText("Customer support and international enquiries", {
          exact: true,
        }),
      ).toBeVisible();
      for (const scheme of ["light", "dark"]) {
        await page.evaluate(
          (value) =>
            document.documentElement.setAttribute(
              "data-mantine-color-scheme",
              value,
            ),
          scheme,
        );
        const a = await search.boundingBox(),
          b = await filters.boundingBox();
        expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(a!.height - b!.height)).toBeLessThanOrEqual(1);
        expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x);
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(path + "-" + width + "-" + scheme + ".png"),
          fullPage: true,
        });
      }
      await filters.click();
      await expect(
        page.getByRole("button", { name: "Apply filters", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "Recent Submissions", exact: true }),
    ).toBeVisible();
    if (width < 992) {
      const list = page.getByRole("list", { name: "Recent Submissions" });
      await expect(list.getByRole("listitem")).toHaveCount(5);
      const first = list.getByRole("link").first();
      await first.focus();
      await expect(first).toBeFocused();
      await expect(list.getByRole("button")).toHaveCount(0);
      const link = page.getByRole("link", {
        name: "View all Submissions",
        exact: true,
      });
      expect((await link.boundingBox())!.y).toBeGreaterThan(
        (await list.boundingBox())!.y,
      );
      await first.press("Enter");
      await expect(page).toHaveURL(/\/app\/submissions\/[^?]+\?returnTo=/);
      await page.goto("/app");
    } else {
      await expect(
        page
          .getByRole("table", { name: "Recent Submissions" })
          .getByRole("row"),
      ).toHaveCount(11);
    }
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.setAttribute(
            "data-mantine-color-scheme",
            value,
          ),
        scheme,
      );
      await page
        .getByRole("link", { name: "View all Submissions", exact: true })
        .scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath("dashboard-" + width + "-" + scheme + ".png"),
        fullPage: true,
      });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  }
  await page.route("**/api/admin/v1/dashboard", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.summary.recentSubmissions = [];
    data.summary.totalSubmissionCount = 0;
    await route.fulfill({ json: data });
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app");
    await expect(
      page.getByText("No Submissions yet", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View all Submissions", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("dashboard-empty-" + width + ".png"),
      fullPage: true,
    });
  }
});
