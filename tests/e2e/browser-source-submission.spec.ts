import { expect, test } from "@playwright/test";
import { solveChallenge } from "altcha-lib/v1";

import { ensureE2eRateLimits } from "./support/rate-limits";

test("a public browser form stores the final repeated field value", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);

  await page.goto("/app/settings");
  await page.getByRole("tab", { name: "Protection", exact: true }).click();
  const altchaMaxNumber = page.locator('input[name="altchaMaxNumber"]');
  if (await altchaMaxNumber.inputValue() !== "1") {
    await altchaMaxNumber.fill("1");
    await page.getByRole("group", { name: "ALTCHA", exact: true }).getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("ALTCHA saved.", { exact: true })).toBeVisible();
  }

  const sourceName = `Public E2E form ${testInfo.project.name}-${testInfo.retry}`;
  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(sourceName);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);

  const sourceId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("tab", { name: /Protection/ }).click();
  await expect(page.locator("#altcha-enabled")).toBeChecked();
  await page.locator("#honeypot-enabled").click();
  await page.getByRole("button", { name: "Save protection" }).click();
  const challengeResponse = await page.request.get(`/api/challenge/${sourceId}`);
  await expect(challengeResponse).toBeOK();
  const challenge = await challengeResponse.json();
  const solution = await solveChallenge(
    challenge.challenge,
    challenge.salt,
    challenge.algorithm,
    challenge.maxnumber,
  ).promise;
  expect(solution).not.toBeNull();
  const sourceDetailResponse = await page.request.get(
    `/api/admin/v1/sources/${sourceId}`,
  );
  await expect(sourceDetailResponse).toBeOK();
  const { source } = await sourceDetailResponse.json();

  const body = new URLSearchParams([
    ["email", "e2e@example.test"],
    ["topic", "first"],
    ["topic", ""],
    ["topic", "second"],
    [source.honeypotFieldNames[0], ""],
    ["altcha", Buffer.from(JSON.stringify({ ...challenge, ...solution! })).toString("base64url")],
  ]);
  const submissionResponse = await page.request.post(`/api/submit/${sourceId}`, {
    data: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  await expect(submissionResponse).toBeOK();
  await expect(submissionResponse.json()).resolves.toEqual({ success: true });

  await page.goto("/app/submissions?search=e2e%40example.test");
  const submissionLink = page.locator('tbody tr').filter({ hasText: sourceName }).first();
  await expect(submissionLink).toBeVisible();
  await submissionLink.click();
  // The Submission payload opens in the Fields view.
  const payload = page.locator('[data-slot="resource-section"]', { hasText: "Data" });
  await expect(payload).toContainText("e2e@example.test");
  await expect(payload).toContainText("second");
  await expect(payload).not.toContainText("first");
  await expect(payload).not.toContainText("(empty)");
});
