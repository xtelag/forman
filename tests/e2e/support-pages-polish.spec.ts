import { expect, test } from "@playwright/test";

test("supporting pages and dashboard remain usable at narrow widths", async ({
  page,
}) => {
  await page.goto("/login?session=expired");
  await expect(page.getByRole("status")).toContainText("Signed out");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  await expect(
    page.getByRole("region", { name: "Activity summary" }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "Activity summary" });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      summary.getByRole("link", { name: "Waiting Callbacks", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await summary.getByRole("link", { name: "Failed Actions Last 24 hours" }).click();
  await expect(page).toHaveURL(
    /\/app\/pipeline-runs\?actionStatus=failed_24h$/,
  );
  await page.goto("/confirmations/invalid-preview-token");
  await expect(
    page.getByRole("heading", { name: "Confirmation unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.goto("/missing-ui-polish-page");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to home" }),
  ).toHaveAttribute("referrerpolicy", "no-referrer");
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/app");
});
