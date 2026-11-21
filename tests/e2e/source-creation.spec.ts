import { expect, test } from "@playwright/test";

test("user creates an immediately usable form", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");

  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(`E2E contact form ${testInfo.project.name}-${testInfo.retry}`);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page.screenshot({path:testInfo.outputPath("create-source-types.png"),fullPage:false});
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);

  const sourceId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("tab", { name: "Integration", exact: true }).click();
  await expect(page.getByRole("note")).toContainText("Field definition required");
  await expect(page.getByText(`POST http://localhost:3100/api/submit/${sourceId}`)).toBeVisible();
  await expect(page.getByRole("tabpanel").getByRole("tab")).toHaveCount(0);

  await page.getByRole("tab", {name:"Configuration",exact:true}).click();
  await expect(page.getByText(/Source · (One-shot|Session|M2M) · ID:/)).toBeVisible();
  await expect(page.getByLabel("Enable sessions", {exact:true})).toHaveCount(0);
});

test("user sees one inline error when renaming a form to an existing friendly name", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");

  const firstName = `Duplicate source ${testInfo.project.name}-${testInfo.retry}`;
  const secondName = `Duplicate target ${testInfo.project.name}-${testInfo.retry}`;

  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(firstName);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);

  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(secondName);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);

  const targetId = new URL(page.url()).pathname.split("/").at(-1)!;

  const friendlyName = page.getByRole("textbox", { name: "Name", exact: true });
  await friendlyName.fill(firstName);
  await page.getByRole("button", { name: "Save configuration" }).click();

  await expect(page).toHaveURL(`/app/sources/${targetId}`);
  await expect(page.getByRole("alert").filter({ hasText: "Review the Source settings" })).toHaveCount(0);
  await expect(page.getByText("Choose a unique Source name.")).toBeVisible();
  await expect(friendlyName).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("heading", { name: new RegExp(secondName) })).toBeVisible();
});
