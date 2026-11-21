import { expect, test } from "@playwright/test";

test("user changes the initial password and signs in with the replacement", async ({ page }) => {
  const nextPassword = "a-long-e2e-replacement-password";

  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  const initialPasswordAlert = page.getByRole("alert").filter({
    hasText: "Initial password is still active.",
  });
  await expect(initialPasswordAlert).toBeVisible();
  await expect(initialPasswordAlert.getByRole("link", {
    name: "Change the password",
  })).toHaveAttribute("href", "/app/settings#password");

  await initialPasswordAlert.getByRole("link", { name: "Change the password" }).click();
  await page.getByRole("tab", { name: "Account" }).click();
  await page.locator('input[name="currentPassword"]').fill("forman-e2e-password-2026");
  await page.locator('input[name="nextPassword"]').fill(nextPassword);
  await page.locator('input[name="confirmPassword"]').fill(nextPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL("/login?password=changed");
  await expect(page.getByRole("status")).toHaveText("Password changed. Sign in again to continue.");

  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The username or password is invalid." })).toHaveText("The username or password is invalid.");

  await page.locator('input[name="password"]').fill(nextPassword);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await expect(page.getByRole("alert").filter({
    hasText: "Initial password is still active.",
  })).toHaveCount(0);
});
