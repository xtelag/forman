import { expect, test } from "@playwright/test";

test("lists use plain values, pointer rows, keyboard navigation and independent controls", async ({
  page,
}, info) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const source = {
    id: "internal",
    sourceId: "public",
    name: "Contact",
    enabled: true,
    type: "one-shot",
    tags: [],
    pipelineCount: 1,
    totalSubmissionCount: 3,
    submissionsLast24Hours: 1,
    submissionsLast7Days: 2,
    submissionsLast30Days: 3,
    lastSubmission: null,
  };
  let pipeline = {
    id: "pipeline",
    name: "Notify",
    enabled: true,
    sourceId: "internal",
    sourcePublicId: "public",
    sourceName: "Contact",
    steps: [],
    tags: [],
  };
  const other = {
    ...pipeline,
    id: "other",
    name: "Other Pipeline",
    sourceId: "another",
    sourcePublicId: "other-public",
    sourceName: "Other Source",
  };
  await page.route("**/api/admin/v1/sources", (r) =>
    r.fulfill({ json: { items: [source] } }),
  );
  await page.route("**/api/admin/v1/tags", (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/admin/v1/pipelines", (r) =>
    r.fulfill({ json: { items: [pipeline, other] } }),
  );
  await page.route("**/api/admin/v1/pipelines/pipeline", async (r) => {
    if (r.request().method() === "PATCH") {
      expect(r.request().postDataJSON()).toEqual({ enabled: false });
      pipeline = { ...pipeline, enabled: false };
    }
    await r.fulfill({ json: pipeline });
  });
  await page.goto("/app/sources");
  await page
    .getByRole("button", { name: "Actions for Contact", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Open Source", exact: true }),
  ).toHaveAttribute("href", "/app/sources/public");
  await expect(
    page.getByRole("menuitem", { name: "View Submissions", exact: true }),
  ).toHaveAttribute("href", "/app/submissions?sourceId=internal");
  const originalViewport = page.viewportSize()!;
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 667, height: 375 });
  await page
    .getByRole("button", { name: "Actions for Contact", exact: true })
    .click();
  const sourceMenu = page.getByRole("menu");
  await expect(async () => {
    const box = await sourceMenu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(375);
  }).toPass({ timeout: 5000 });
  await sourceMenu
    .getByRole("menuitem", { name: "Deactivate", exact: true })
    .focus();
  await expect(
    sourceMenu.getByRole("menuitem", { name: "Deactivate", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await page.setViewportSize(originalViewport);
  await page
    .getByRole("button", { name: "Actions for Contact", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "View Pipelines", exact: true })
    .click();
  await expect(page).toHaveURL(/pipelines\?sourceId=internal$/);
  await expect(
    page.getByText("Notify", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Other Pipeline", { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  const remove = page.getByRole("button", {
    name: "Remove filter Source: Contact",
  });
  await expect(remove).toBeVisible();
  const menuTrigger = page.getByRole("button", {
    name: "Actions for Notify",
    exact: true,
  });
  if (info.project.name === "mobile") {
    const box = await menuTrigger.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await menuTrigger.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Delete permanently" }),
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "Disable", exact: true }).click();
  await expect(
    page.getByText("Pipeline disabled", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/sourceId=internal$/);
  await remove.click();
  await expect(
    page.getByText("Other Pipeline", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const pipelineRecords = page.locator(
    info.project.name === "mobile"
      ? '[data-slot="resource-table-mobile-list"]'
      : '[data-slot="resource-table-desktop"]',
  );
  await expect(pipelineRecords.getByRole("link")).toHaveCount(0);
  const notifyRow = pipelineRecords
    .getByRole(info.project.name === "mobile" ? "listitem" : "row")
    .filter({ hasText: "Notify" });
  await expect(notifyRow).toHaveCSS("cursor", "pointer");
  await notifyRow.press("Enter");
  await expect(page).toHaveURL(/\/app\/pipelines\/pipeline$/);
  let item = {
    id: "item",
    preview: "Test response",
    sourceId: "internal",
    sourcePublicId: "public",
    sourceName: "Contact",
    actionName: "Review",
    createdAt: "2026-10-01T07:00:00Z",
    state: "unread",
    trashedAt: null,
    tags: [],
  };
  await page.route("**/api/admin/v1/inbox?*", (r) =>
    r.fulfill({ json: { items: [item], total: 1 } }),
  );
  await page.route("**/api/admin/v1/inbox/item", async (r) => {
    if (r.request().method() === "PATCH") {
      expect(r.request().postDataJSON()).toEqual({ action: "read" });
      item = { ...item, state: "read" };
    }
    await r.fulfill({ json: { ...item, payloadJson: {}, submissionId: null } });
  });
  await page.goto("/app/inbox");
  const records = page.locator(
    info.project.name === "mobile"
      ? '[data-slot="resource-table-mobile-list"]'
      : '[data-slot="resource-table-desktop"]',
  );
  await expect(records.getByRole("link")).toHaveCount(0);
  await records
    .getByRole("checkbox", { name: "Select inbox item", exact: true })
    .check();
  await expect(page).toHaveURL("/app/inbox");
  await records
    .getByRole("button", { name: "Actions for Test response" })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Open Source", exact: true }),
  ).toHaveAttribute("href", "/app/sources/public");
  await page.getByRole("menuitem", { name: "Mark as read", exact: true }).click();
  await expect(page.getByText("Marked read", { exact: true })).toBeVisible();
  await expect(page).toHaveURL("/app/inbox");
  await expect(
    records.getByRole("link", { name: "Contact", exact: true }),
  ).toHaveCount(0);
  await records
    .getByRole("checkbox", { name: "Select inbox item", exact: true })
    .check();
  if (info.project.name === "mobile")
    await records.getByText("Received", { exact: true }).click();
  else await records.getByRole("row").nth(1).getByRole("cell").nth(3).click();
  await expect(page).toHaveURL(/\/app\/inbox\/item\?returnTo=/);
});
