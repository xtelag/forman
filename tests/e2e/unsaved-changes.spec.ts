import { expect, test } from "@playwright/test";

test("Source drafts survive cancelled links, browser back and logout", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page.getByLabel("Password", { exact: true }).fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source", exact: true }).click();
  await page.locator("#form-name").fill(`Draft guard ${testInfo.project.name}`);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[a-z0-9]+$/);
  const detailUrl = page.url();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Keep this unsaved name");
  page.once("dialog", (dialog) => dialog.dismiss());
  // This link exists inside the detail even when the mobile sidebar is closed.
  await page.getByRole("link", { name: /Back to/ }).click();
  await expect(page).toHaveURL(detailUrl);
  await expect(name).toHaveValue("Keep this unsaved name");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(detailUrl);
  await expect(name).toHaveValue("Keep this unsaved name");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(detailUrl);
  await expect(name).toHaveValue("Keep this unsaved name");
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/sources$/);
  await page.goForward();
  await expect(page).toHaveURL(detailUrl);
  // The discarded name was never saved to the Source.
  await expect(name).toHaveValue(`Draft guard ${testInfo.project.name}`);
});
