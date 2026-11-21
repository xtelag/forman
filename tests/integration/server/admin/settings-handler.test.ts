import { afterEach, describe, expect, test } from "vitest";

import { createAdminSettingsHandler } from "@/server/admin/settings-handler";
import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

const isoTimestamp = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
);

describe("admin settings handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() =>
    databases.splice(0).forEach((database) => database.dispose()),
  );

  test("returns protection settings for an authenticated administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);

    const response = await createAdminSettingsHandler({
      database: database.db,
    }).get(
      new Request("https://forman.test/api/admin/v1/settings", {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      altchaMaxNumber: 100_000,
      challengeRateLimitPerMinute: 60,
      challengeTtlSeconds: 1_200,
      clientBurstLimit: 3,
      clientRateLimitPerMinute: 20,
      failedActionRetentionDays: 30,
      inboxRetentionDays: 365,
      sourceRateLimitPerMinute: 100,
      formspreeCompatibilityEndpointEnabled: false,
      adminSessionIdleDays: 7,
      adminSessionAbsoluteDays: 30,
      loginFailureLimit: 5,
      loginFailureWindowSeconds: 900,
      rateLimiterCapacity: 10_000,
      rateLimiterTtlSeconds: 3_600,
      robotsTxt: "User-agent: *\nDisallow: /\n",
      submissionRateLimitPerMinute: 5,
      webhookSsrfProtectionEnabled: true,
      smtp: {
        authentication: true, from: null, fromName: null,
        host: null,
        passwordConfigured: false,
        port: null,
        encryption: "tls",
        status: "not-configured",
        username: null,
      },
      updatedAt: isoTimestamp,
    });
  });

  test("rejects unauthenticated settings reads and writes", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const handler = createAdminSettingsHandler({ database: database.db });

    expect(
      (
        await handler.get(
          new Request("https://forman.test/api/admin/v1/settings"),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handler.update(
          new Request("https://forman.test/api/admin/v1/settings", {
            body: JSON.stringify({ submissionRateLimitPerMinute: 12 }),
            headers: { "content-type": "application/json" },
            method: "PUT",
          }),
        )
      ).status,
    ).toBe(401);
  });

  test("rejects invalid settings without changing the active values", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const handler = createAdminSettingsHandler({ database: database.db });

    const response = await handler.update(
      new Request("https://forman.test/api/admin/v1/settings", {
        body: JSON.stringify({ submissionRateLimitPerMinute: 0 }),
        headers: {
          cookie: `__Host-forman_session=${token}`,
          "content-type": "application/json",
        },
        method: "PUT",
      }),
    );

    expect(response.status).toBe(400);
    const settings = await handler.get(
      new Request("https://forman.test/api/admin/v1/settings", {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );
    await expect(settings.json()).resolves.toMatchObject({
      submissionRateLimitPerMinute: 5,
    });
  });
});
