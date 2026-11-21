import { expect, type Page } from "@playwright/test";

const rateLimit = 100_000;

export async function ensureE2eRateLimits(page: Page) {
  const response = await page.request.get("/api/admin/v1/settings");
  await expect(response).toBeOK();
  const settings = await response.json() as {
    clientBurstLimit: number;
    clientRateLimitPerMinute: number;
    sourceRateLimitPerMinute: number;
    submissionRateLimitPerMinute: number;
  };

  if (
    settings.clientBurstLimit === rateLimit
    && settings.clientRateLimitPerMinute === rateLimit
    && settings.sourceRateLimitPerMinute === rateLimit
    && settings.submissionRateLimitPerMinute === rateLimit
  ) return;

  const update = await page.request.put("/api/admin/v1/settings", {
    data: {
      clientBurstLimit: rateLimit,
      clientRateLimitPerMinute: rateLimit,
      sourceRateLimitPerMinute: rateLimit,
      submissionRateLimitPerMinute: rateLimit,
    },
    headers: { origin: "http://localhost:3100" },
  });
  await expect(update).toBeOK();
}
