import { expect, test } from "@playwright/test";

test("collection menus preserve keyboard focus and visible deletion failures", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const name =
    "Customer enquiries — a long record name for the mobile administration";
  const source = {
    id: "source-internal",
    sourceId: "source-public",
    name,
    type: "one-shot",
    enabled: false,
    tags: [],
    pipelineCount: 0,
    lastSubmission: null,
    submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
  };
  const form = {
    id: "page-internal",
    pageId: "page-public",
    name,
    sourceId: source.id,
    sourcePublicId: source.sourceId,
    sourceName: "Contact",
    enabled: false,
    tags: [],
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
    publicUrl: "http://localhost:3100/pages/page-public",
  };
  for (const kind of ["sources", "pages"] as const) {
    const item = kind === "sources" ? source : form;
    await page.route("**/api/admin/v1/" + kind, (route) =>
      route.fulfill({ json: { items: [item] } }),
    );
    await page.goto("/app/" + kind);
    const trigger = page.getByRole("button", {
      name: (kind === "sources" ? "Actions for " : "Actions for Built-in Form ") + name,
      exact: true,
    });
    await trigger.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const action = "Delete permanently";
    await menu.getByRole("menuitem", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expect(dialog).toContainText(name);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await page.route("**/api/admin/v1/" + kind + "/*", async (route) => {
      requests++;
      expect(route.request().method()).toBe("DELETE");
      await gate;
      await route.fulfill({ status: 500, json: { error: "Test failure" } });
    });
    await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Deleting…" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog.getByRole("alert")).toContainText(
      "could not be deleted",
    );
    expect(requests).toBe(1);
    await page.screenshot({
      path: testInfo.outputPath(kind + "-delete-error.png"),
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await page.getByRole("menuitem", { name: action, exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.unroute("**/api/admin/v1/" + kind + "/*");
    await page.route("**/api/admin/v1/" + kind + "/*", async route => {
      await page.unroute("**/api/admin/v1/" + kind);
      await page.route("**/api/admin/v1/" + kind, r=>r.fulfill({json:{items:[]}}));
      await route.fulfill({status:204});
    });
    await trigger.press("Enter");
    await page.getByRole("menuitem", {name:action,exact:true}).click();
    await page.getByRole("dialog").getByRole("button", {name:action,exact:true}).click();
    await expect(trigger).toHaveCount(0);
    await expect(page.getByRole("heading",{level:1})).toBeFocused();
  }
});
