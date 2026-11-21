import { expect, test } from "@playwright/test";

import { ensureE2eRateLimits } from "./support/rate-limits";

test("a rotated server token immediately replaces the prior credential", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);

  const sourceName = `E2E server form ${testInfo.project.name}-${testInfo.retry}`;
  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(sourceName);
  await page.getByRole("radio", { name: "M2M", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(
    /\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/,
  );

  const sourceId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("tab", { name: /Protection/ }).click();
  await page.getByRole("button", { name: "Show token" }).click();
  const tokenInput = page.getByRole("textbox", {
    name: "Machine-to-machine token value",
  });
  await expect(tokenInput).not.toHaveValue(/…/);
  const firstToken = await tokenInput.inputValue();
  expect(firstToken).toBeTruthy();

  const accepted = await page.request.post(`/api/submit/${sourceId}`, {
    data: { source: ["e2e"], status: ["before rotation"] },
    headers: { authorization: `Bearer ${firstToken}` },
  });
  await expect(accepted).toBeOK();
  await expect(accepted.json()).resolves.toEqual(
    expect.objectContaining({ success: true }),
  );

  await page.getByRole("button", { name: "Regenerate token" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: "Regenerate token",
    })
    .click();
  await expect(tokenInput).not.toHaveValue(firstToken!);
  const secondToken = await tokenInput.inputValue();
  expect(secondToken).toBeTruthy();

  const rejected = await page.request.post(`/api/submit/${sourceId}`, {
    data: { source: ["e2e"], status: ["old token"] },
    headers: { authorization: `Bearer ${firstToken}` },
  });
  expect(rejected.status()).toBe(401);

  const acceptedAfterRotation = await page.request.post(
    `/api/submit/${sourceId}`,
    {
      data: { source: ["e2e"], status: ["after rotation"] },
      headers: { authorization: `Bearer ${secondToken}` },
    },
  );
  await expect(acceptedAfterRotation).toBeOK();

  const created = await acceptedAfterRotation.json();
  await page.goto("/app/submissions/" + created.submissionId);
  await page.getByText("JSON", { exact: true }).click();
  await expect(page.getByLabel("Payload JSON", { exact: true })).toContainText(
    "after rotation",
  );
});
