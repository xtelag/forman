import { expect, test } from "@playwright/test";

test("new sources show and save the unrestricted authorized-domain default", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");

  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(`Authorized domains ${testInfo.project.name}-${testInfo.retry}`);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[^/]+$/);

  await page.getByRole("tab", { name: /Protection/ }).click();
  const authorizedDomains = page.getByLabel("Authorized domain(s)");
  await expect(authorizedDomains).toHaveValue("*");
  await expect(authorizedDomains).toHaveAccessibleDescription("One origin per line. * allows any website. Origin restrictions are not authentication; server-to-server requests require a server token.");
  await expect(authorizedDomains).toHaveValue("*");

  const sourceId = new URL(page.url()).pathname.split("/").at(-1)!;
  const configured = await page.request.put(`/api/admin/v1/sources/${sourceId}`, {
    data: {
      allowedOrigins: ["https://allowed.example.test"],
      altchaEnabled: true,
      challengeRateLimitPerMinute: null,
      honeypotEnabled: false,
      maxBodyBytes: 65_536,
      maxEntries: 50,
      maxKeyLength: 100,
      maxUniqueKeys: 30,
      maxValueLength: 10_000,
      maxValuesPerKey: 20,
      name: `Authorized domains ${testInfo.project.name}-${testInfo.retry}`,
      retentionDays: null,
      storeReferer: false,
      storeUserAgent: false,
      submissionRateLimitPerMinute: null,
      successUrl: null,
    },
    headers: { origin: "http://localhost:3100" },
  });
  expect(configured.status()).toBe(200);

  const rejectedChallenge = await page.request.get(`/api/challenge/${sourceId}`, {
    headers: { origin: "https://other.example.test" },
  });
  expect(rejectedChallenge.status()).toBe(403);

  const rejectedSubmission = await page.request.post(`/api/submit/${sourceId}`, {
    data: "email=blocked",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://other.example.test" },
  });
  expect(rejectedSubmission.status()).toBe(403);

  const originlessChallenge = await page.request.get(`/api/challenge/${sourceId}`);
  expect(originlessChallenge.status()).toBe(200);

  const originlessPreflight = await page.request.fetch(`/api/submit/${sourceId}`, {
    headers: { "access-control-request-method": "POST" }, method: "OPTIONS",
  });
  expect(originlessPreflight.status()).toBe(400);

  const rejectedPreflight = await page.request.fetch(`/api/submit/${sourceId}`, {
    headers: { "access-control-request-method": "POST", origin: "https://other.example.test" }, method: "OPTIONS",
  });
  expect(rejectedPreflight.status()).toBe(403);
});
