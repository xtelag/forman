import { expect, test } from "@playwright/test";

test("collection states remain readable and retryable", async ({
  page,
}, info) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failure = true;
  await page.route("**/api/admin/v1/pages", async (route) => {
    await gate;
    await route.fulfill(
      failure
        ? { status: 500, json: { error: "Test failure" } }
        : { json: { items: [] } },
    );
  });
  await page.goto("/app/pages");
  await expect(
    page.locator('[data-slot="collection-loading-skeleton"]'),
  ).toBeVisible();
  await expect(page.getByText("Loading Built-in Forms", { exact: true })).toBeAttached();
  await page.screenshot({ path: info.outputPath("loading.png") });
  release();
  await expect(
    page.getByRole("heading", { name: "Built-in Forms could not be loaded" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("error.png") });
  failure = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator('[data-slot="page-state"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Built-in Forms could not be loaded" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("empty.png") });
});
