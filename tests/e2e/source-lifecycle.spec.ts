import { expect, test } from "@playwright/test";

import { ensureE2eRateLimits } from "./support/rate-limits";

test("user deactivates, reactivates, and deletes a form", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);

  const sourceName = `E2E lifecycle form ${testInfo.project.name}-${testInfo.retry}`;
  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(sourceName);
  await page.getByRole("radio", { name: "M2M", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);
  const sourceId = new URL(page.url()).pathname.split("/").at(-1)!;
  const detailHeading = page.getByRole("heading", { name: new RegExp(sourceName) });
  await expect(detailHeading).toBeVisible();
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveCount(0);
  // Compare where the shared page header starts.
  const header = page.locator('[data-slot="page-header"]');
  const detailBox = await header.boundingBox();
  await page.goto("/app/sources");
  const listHeading = page.getByRole("heading", { name: "Data Sources" });
  await expect(listHeading).toBeVisible();
  const listBox = await header.boundingBox();
  expect(Math.round(listBox!.y)).toBe(Math.round(detailBox!.y));
  await page.goto(`/app/sources/${sourceId}`);

  await page.getByRole("tab", { name: /Protection/ }).click();
  await page.getByRole("button", { name: "Show token" }).click();
  const tokenInput = page.getByRole("textbox", {
    name: "Machine-to-machine token value",
  });
  await expect(tokenInput).not.toHaveValue(/…/);
  const token = await tokenInput.inputValue();
  expect(token).toBeTruthy();

  await page.getByRole("button", { name: "Source actions" }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Inactive Sources cannot receive Submissions.")).toBeVisible();
  await page.getByRole("button", { name: "Source actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Activate" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog")).toContainText("Permanently deletes this Source; it has no stored Submissions.");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  const rejected = await page.request.post(`/api/submit/${sourceId}`, {
    data: { status: ["inactive"] },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(rejected.status()).toBe(503);

  await page.getByRole("button", { name: "Source actions" }).click();
  await page.getByRole("menuitem", { name: "Activate" }).click();
  await page.getByRole("button", { name: "Source actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Deactivate" })).toBeVisible();
  await page.keyboard.press("Escape");
  const accepted = await page.request.post(`/api/submit/${sourceId}`, {
    data: { status: ["active again"] },
    headers: { authorization: `Bearer ${token}` },
  });
  await expect(accepted).toBeOK();

  await page.getByRole("button", { name: "Source actions" }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("button", { name: "Source actions" }).click();
  await page.getByRole("menuitem", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog")).toContainText("Permanently deletes the Source and its 1 stored Submissions.");
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL("/app/sources");
  await expect(page.getByText(sourceName)).toHaveCount(0);

  const deleted = await page.request.post(`/api/submit/${sourceId}`, {
    data: { status: ["deleted"] },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(deleted.status()).toBe(503);
});
