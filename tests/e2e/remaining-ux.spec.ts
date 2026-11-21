import { expect, test } from "@playwright/test";
import { openFilters } from "./support/filter-panel";
import axe from "axe-core";

test("large submission collection preserves filters, selection and return navigation", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const sourceName =
    "Customer enquiries — international support " + "reference".repeat(18);
  const records = Array.from({ length: 57 }, (_, index) => ({
    id: `review-${index + 1}`,
    sourceId: "review-source",
    sourcePublicId: "review-public",
    sourceName,
    type: "one-shot",
    state: "completed",
    createdAt: new Date(Date.UTC(2026, 8, 23, 12, index)).toISOString(),
    tags: [],
    payload: { entries: [] },
    referer: null,
    userAgent: null,
  }));
  await page.route("**/api/admin/v1/submissions?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const filtered = query.get("search") ? records.slice(0, 23) : records;
    const offset = Number(query.get("offset") ?? 0);
    const limit = Number(query.get("limit") ?? 10);
    return route.fulfill({
      json: {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
        deletableTotal: filtered.length,
      },
    });
  });
  await page.route("**/api/admin/v1/submissions/review-*", (route) => {
    const item = records.find((record) =>
      route.request().url().endsWith(record.id),
    )!;
    return route.fulfill({
      json: {
        ...item,
        pipelineRuns: [],
        payload: {
          message: "A customer request with enough context for review.",
        },
        userAgent: "Agent/" + "version".repeat(60),
        referer: "https://example.test/" + "campaign".repeat(60),
      },
    });
  });
  await page.goto("/app/submissions");
  await expect(page.getByText("Page 1 of 6", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Next page", exact: true })
    .press("Enter");
  await expect(page.getByText("Page 2 of 6", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Select submission review-11", exact: true })
    .check();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 3 of 6", { exact: true })).toBeVisible();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await openFilters(page);
  await page.getByLabel("Search", { exact: true }).fill("customer");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("Page 1 of 3", { exact: true })).toBeVisible();
  await expect(page.getByText("1 selected", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();
  const returnUrl = new URL(page.url()).pathname + new URL(page.url()).search;
  await page.getByRole("button",{name:"Actions for Submission review-11",exact:true}).filter({visible:true}).click();
  await page.getByRole("menuitem",{name:"Open Submission",exact:true}).click();
  await expect(
    page.getByRole("heading", { name: "Submission", exact: true }),
  ).toBeVisible();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Switch to dark theme" })
        .press("Enter");
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () =>
        (window as unknown as { axe: typeof axe }).axe
          .run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
          .then((result) => result.violations),
      );
      expect(
        violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`submission-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page
    .getByRole("link", { name: "Back to all Submissions" })
    .press("Enter");
  await expect(page).toHaveURL(returnUrl);
  await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();
  await openFilters(page);
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue(
    "customer",
  );
  await page.getByRole("button", { name: "Last page", exact: true }).click();
  await expect(page.getByText("Page 3 of 3", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Reset filters" }).click();
  await expect(page.getByText("Page 1 of 6", { exact: true })).toBeVisible();
});

test("admin collections and settings have accessible themes and keyboard dialogs", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  async function audit(label: string) {
    await page.addScriptTag({ content: axe.source });
    const result = await page.evaluate(async () =>
      (window as unknown as { axe: typeof axe }).axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    await info.attach(label, {
      body: JSON.stringify(
        { violations: result.violations, incomplete: result.incomplete },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect
      .soft(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        label,
      )
      .toEqual([]);
    expect
      .soft(
        await page.evaluate(() => document.documentElement.scrollWidth),
        label + " overflow",
      )
      .toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const headers = { origin: "http://localhost:3100" };
  const sourceResponse = await page.request.post("/api/admin/v1/sources", {
    headers,
    data: {
      name: "Accessibility source " + info.project.name,
      type: "one-shot",
    },
  });
  expect(sourceResponse.status()).toBe(201);
  const source = await sourceResponse.json();
  const fieldsResponse = await page.request.patch(
    "/api/admin/v1/sources/" + source.sourceId,
    {
      headers,
      data: {
        section: "source-fields",
        values: {
          fieldDefinitionMode: "json-schema",
          fieldDefinitionSource: JSON.stringify({
            type: "object",
            properties: {
              email: {
                type: "string",
                format: "email",
                minLength: 1,
                maxLength: 100,
              },
              message: { type: "string", maxLength: 1000 },
            },
            required: ["email"],
            additionalProperties: false,
          }),
        },
      },
    },
  );
  expect(fieldsResponse.ok(), await fieldsResponse.text()).toBe(true);
  const pipelineResponse = await page.request.post("/api/admin/v1/pipelines", {
    headers,
    data: {
      sourceId: source.id,
      name: "Accessibility pipeline " + info.project.name,
    },
  });
  expect(pipelineResponse.status()).toBe(201);
  const pipeline = await pipelineResponse.json();
  const formResponse = await page.request.post("/api/admin/v1/pages", {
    headers,
    data: {
      sourceId: source.id,
      name: "Accessibility form " + info.project.name,
    },
  });
  expect(formResponse.status()).toBe(201);
  const form = await formResponse.json();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Switch to dark theme" })
        .press("Enter");
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    for (const [path, title, create] of [
      ["/app", "Dashboard", ""],
      ["/app/inbox", "Inbox", ""],
      ["/app/submissions", "Submissions", ""],
      ["/app/pipeline-runs", "Pipeline Runs", ""],
      ["/app/callbacks", "Waiting Callbacks", ""],
      ["/app/sources", "Data Sources", "Create Source"],
      ["/app/pipelines", "Pipelines", "Create Pipeline"],
      ["/app/pages", "Built-in Forms", "Create Built-in Form"],
      ["/app/settings", "Settings", ""],
      ["/app/sources/" + source.sourceId, source.name, ""],
      ["/app/pipelines/" + pipeline.id, pipeline.name, ""],
      ["/app/pages/" + form.pageId, form.name, ""],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        title,
      );
      const collapsedIds = await page
        .locator('main .mantine-Accordion-control[aria-expanded="false"]')
        .evaluateAll((elements) => elements.map((element) => element.id));
      for (const id of collapsedIds) {
        const control = page.locator('[id="' + id + '"]');
        await control.press("Enter");
        await expect(control).toHaveAttribute("aria-expanded", "true");
      }
      await audit(theme + path);
      if (theme === "light" && path === "/app/pipelines/" + pipeline.id) {
        await page
          .getByRole("button", { name: "Add Action", exact: true })
          .click();
        await expect(
          page.getByLabel("Action 1 name", { exact: true }),
        ).toBeVisible();
        await page
          .getByLabel("Action 1 name", { exact: true })
          .fill("Store enquiry");
        await page.getByLabel("Action 1 type", { exact: true }).click();
        await page.getByRole("option", { name: "Inbox", exact: true }).click();
        await audit(theme + " action editor");
        await page
          .getByRole("button", { name: "Save Action", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Save Action", exact: true }),
        ).toBeDisabled();
      }

      if (create) {
        await page.route("**/api/admin/v1/sources", (route) =>
          route.fulfill({ json: { items: [] } }),
        );
        const trigger = page.getByRole("button", { name: create, exact: true });
        await trigger.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await audit(theme + create);
        for (let step = 0; step < 8; step++) {
          await page.keyboard.press("Tab");
          expect(
            await dialog.evaluate((element) =>
              element.contains(document.activeElement),
            ),
          ).toBe(true);
        }
        await page.keyboard.press("Shift+Tab");
        expect(
          await dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        await page.unroute("**/api/admin/v1/sources");
      }
    }
  }
});
