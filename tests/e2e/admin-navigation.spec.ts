import { expect, test } from "@playwright/test";

test("Dashboard retains data during a refresh outage and recovers through retry", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page.getByLabel("Password").fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const summary = page.getByRole("region", { name: "Activity summary" });
  await expect(summary).toBeVisible();
  const before = await summary.innerText();

  await page.route("**/api/admin/v1/dashboard", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Temporarily unavailable"}' }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const warning = page.getByRole("alert").filter({ hasText: "Couldn't refresh this page." });
  await expect(warning).toBeVisible();
  await expect(summary).toHaveText(before, { useInnerText: true });
  await expect(warning.getByText(/Showing data from/)).toBeVisible();

  await page.unroute("**/api/admin/v1/dashboard");
  await warning.getByRole("button", { name: "Try again" }).click();
  await expect(warning).toBeHidden();
  await expect(summary).toBeVisible();
  await expect(page.getByRole("link", { name: /Failed Actions/ })).toBeVisible();
  await expect(summary.getByRole("link", { name: "Waiting Callbacks" })).toBeVisible();
});

test("an unreachable server shows one banner and keeps the current page", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page.getByLabel("Password").fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const summary = page.getByRole("region", { name: "Activity summary" });
  await expect(summary).toBeVisible();

  await page.route("**/api/admin/v1/**", (route) => route.abort("connectionrefused"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const banner = page.locator('[data-slot="connection-banner"]');
  await expect(banner).toContainText("Server is unavailable.");
  await expect(page.getByText("Couldn't refresh this page.")).toHaveCount(0);
  await expect(summary).toBeVisible();

  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByText("Server is unavailable. Try again when it is back.")).toBeVisible();
  await expect(page).toHaveURL("/app");

  // Blocked navigation keeps the mobile drawer open; close it to reach the banner.
  if (testInfo.project.name === "mobile") await page.keyboard.press("Escape");
  await page.unroute("**/api/admin/v1/**");
  await banner.getByRole("button", { name: "Retry now" }).click();
  await expect(banner).toBeHidden();
  await expect(summary).toBeVisible();
});

test("user sees the initial-password warning and can navigate and sign in again", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Initial password is still active.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Change the password" })).toHaveAttribute("href", "/app/settings#password");
  const allSubmissions = page.getByRole("link", { name: "View all Submissions" });
  if (await allSubmissions.count()) {
    await expect(allSubmissions).toHaveAttribute("href", "/app/submissions");
  }

  const processingNavigation = [
    ["Submissions", "/app/submissions"],
    ["Pipeline Runs", "/app/pipeline-runs"],
    ["Waiting Callbacks", "/app/callbacks"],
  ] as const;
  const configurationNavigation = [
    ["Data Sources", "/app/sources"],
    ["Pipelines", "/app/pipelines"],
    ["Settings", "/app/settings"],
  ] as const;

  async function openGroup(name: "Data Review" | "Configuration") {
    if (testInfo.project.name === "mobile" && await page.getByRole("dialog", { name: "Navigation" }).count() === 0) {
      await page.getByRole("button", { name: "Toggle navigation" }).click();
    }
    const group = page.getByRole("button", { name });
    if (await group.getAttribute("aria-expanded") !== "true") await group.click();
  }

  for (const [name, href] of processingNavigation) {
    await openGroup("Data Review");
    const link = page.getByRole("link", { exact: true, name });
    await expect(link).toHaveAttribute("href", href);
    await link.click();
    await expect(page).toHaveURL(href);
    if (testInfo.project.name === "mobile") await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
  }

  for (const [name, href] of configurationNavigation) {
    await openGroup("Configuration");
    const link = page.getByRole("link", { exact: true, name });
    await expect(link).toHaveAttribute("href", href);
    await link.click();
    await expect(page).toHaveURL(href);
    if (testInfo.project.name === "mobile") await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
  }

  if (testInfo.project.name === "mobile") {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
  }
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");

  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
});
