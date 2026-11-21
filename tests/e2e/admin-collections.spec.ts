import { expect, test } from "@playwright/test";
import { expectFiltersReachable, openFilters } from "./support/filter-panel";

test("collections keep records and filters reachable on laptops and mobile", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page.getByLabel("Password").fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const longName = "Customer".repeat(24);
  await page.route("**/api/admin/v1/sources", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "source-1",
            sourceId: "source-public",
            name: longName,
            type: "one-shot",
            enabled: true,
            pipelineCount: 2,
            submissionsLast30Days: 12500,
            totalSubmissionCount: 12500,
            submissionsLast24Hours: 0,
            submissionsLast7Days: 0,
            lastSubmission: {
              id: "submission-1",
              createdAt: "2026-09-20T10:30:00Z",
            },
            tags: [],
          },
        ],
      },
    }),
  );
  await page.route("**/api/admin/v1/submissions?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "submission-1",
            sourceId: "source-1",
            sourcePublicId: "source-public",
            sourceName: longName,
            type: "one-shot",
            state: "completed",
            createdAt: "2026-09-20T10:30:00Z",
            tags: [],
            payload: { entries: [] },
            referer: null,
            userAgent: null,
          },
        ],
        total: 1,
        deletableTotal: 1,
      },
    }),
  );
  await page.route("**/api/admin/v1/pages", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "page-1",
            pageId: "page-public",
            name: "Contact form",
            sourceId: "source-1",
            sourcePublicId: "source-public",
            sourceName: longName,
            enabled: true,
            createdAt: "2026-09-20T10:30:00Z",
            updatedAt: "2026-09-20T10:30:00Z",
            tags: [],
          },
        ],
      },
    }),
  );
  await page.route("**/api/admin/v1/pipelines", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "pipeline-1",
            name: "Customer support",
            sourceId: "source-1",
            sourceName: longName,
            enabled: true,
            steps: [],
            tags: [],
          },
        ],
      },
    }),
  );
  await page.route(/\/api\/admin\/v1\/pipeline-runs(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "run-1",
            pipelineId: "pipeline-1",
            pipelineName: "Customer support",
            sourceId: "source-1",
            sourceName: longName,
            createdAt: "2026-09-20T10:30:00Z",
            status: "completed_attention",
            actionCount: 2,
            completedActionCount: 1,
            failedActionCount: 1,
            processingActionCount: 0,
            skippedConditionCount: 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
    }),
  );
  await page.route(/\/api\/admin\/v1\/callbacks(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "callback-1",
            runId: "run-1",
            actionName: "Confirmation",
            actionType: "callback_boolean",
            pipelineId: "pipeline-1",
            pipelineName: "Customer support",
            sourceId: "source-1",
            sourceName: longName,
            waitingSince: "2026-09-20T10:30:00Z",
            callbackExpiresAt: "2026-09-22T10:30:00Z",
          },
        ],
        total: 1,
      },
    }),
  );
  await page.goto("/app/submissions");
  const table = page.getByRole("table", { name: "Submissions", exact: true });
  for (const width of [1280, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(table).toBeVisible();
    await expectFiltersReachable(page, width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await table
    .getByRole("checkbox", {
      name: "Select submission submission-1",
      exact: true,
    })
    .check();
  await expect(page).toHaveURL(/\/app\/submissions$/);
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await openFilters(page);
  await page.getByLabel("Search", { exact: true }).fill("customer enquiry");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/search=customer\+enquiry/);
  await expect(table.getByRole("link")).toHaveCount(0);
  await table
    .getByRole("button", {
      name: "Actions for Submission submission-1",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Open Submission", exact: true }),
  ).toHaveAttribute("href", /returnTo=/);
  await page.keyboard.press("Escape");
  await openFilters(page);
  await page.getByRole("link", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/app\/submissions$/);
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(table).toBeHidden();
    await expect(
      page.locator('[data-slot="resource-table-mobile-row"]').first(),
    ).toBeVisible();
    await expectFiltersReachable(page, width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  for (const [route, title, tableName] of [
    ["sources", "Data Sources", "Sources"],
    ["pages", "Built-in Forms", "Built-in Forms"],
    ["pipelines", "Pipelines", "Pipelines"],
    ["pipeline-runs", "Pipeline Runs", "Pipeline Runs"],
    ["callbacks", "Waiting Callbacks", "Waiting Callbacks"],
  ]) {
    await page.goto("/app/" + route);
    for (const width of [1280, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      const records = page.getByRole("table", { name: tableName, exact: true });
      if (width >= 1024) await expect(records).toBeVisible();
      else
        await expect(
          page.locator('[data-slot="resource-table-mobile-row"]').first(),
        ).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: route + " at " + width,
        })
        .toBeLessThanOrEqual(width);
      if (route === "pipeline-runs" || route === "callbacks")
        await expectFiltersReachable(page, width);
    }
  }
  // Wide layouts must use the available space, including long status labels.
  for (const route of ["submissions", "pipeline-runs", "callbacks"]) {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto("/app/" + route);
    const filters = page.getByRole("search");
    await expect(
      filters.getByRole("button", { name: "Apply filters" }),
    ).toBeVisible();
    const tops = await filters
      .locator("input, select, button")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().top),
      );
    expect(
      Math.max(...tops) - Math.min(...tops),
      route + " filters share one row",
    ).toBeLessThan(2);
    for (const width of [1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      const heading = await page
        .getByRole("heading", { level: 1 })
        .boundingBox();
      const sidebar = await page
        .locator(".mantine-AppShell-navbar")
        .boundingBox();
      expect(
        heading!.x - sidebar!.x - sidebar!.width,
        route + " content gutter",
      ).toBeLessThanOrEqual(32);
    }
    if (route === "pipeline-runs") {
      const status = page
        .getByRole("table")
        .getByText("Completed with attention");
      await expect(status).toBeVisible();
      expect((await status.boundingBox())!.height).toBeLessThanOrEqual(24);
    }
  }
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation
    .getByRole("link", { name: "Pipeline Runs", exact: true })
    .press("Enter");
  const heading = page.getByRole("heading", {
    name: "Pipeline Runs",
    exact: true,
  });
  await expect(heading).toBeFocused();
  await expect(heading).toHaveCSS("outline-style", "none");
  await expect(
    navigation.locator("a[data-active], button[data-active]"),
  ).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Source", { exact: true })).toBeFocused();
});
