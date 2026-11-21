import { afterEach, describe, expect, test } from "vitest";

import { createAdminApplicationHandler } from "@/server/admin/application-handler";
import { createAdminDashboardHandler } from "@/server/admin/dashboard-handler";
import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("admin dashboard handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("returns the dashboard read model for an authenticated administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    await createSource(database.db, { type: "one-shot", name: "Contact" });
    const token = await createSession(database.db);

    const response = await createAdminDashboardHandler({ database: database.db }).get(
      new Request("https://forman.test/api/admin/v1/dashboard", {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      isInitialPassword: true,
      summary: {
        activeSourceCount: 1,
        failedActionCount: 0,
        waitingCallbackCount: 0,
        recentSubmissions: [],
        submissionsLast24Hours: 0,
        submissionsLast7Days: 0,
        submissionsLast30Days: 0,
        totalSubmissionCount: 0,
      },
    });
  });

  test("rejects an unauthenticated dashboard request", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    const response = await createAdminDashboardHandler({ database: database.db }).get(
      new Request("https://forman.test/api/admin/v1/dashboard"),
    );

    expect(response.status).toBe(401);
  });

  test("returns application metadata only for an authenticated administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const handler = createAdminApplicationHandler({ baseUrl: new URL("https://forman.test/"), database: database.db, isProduction: false } as Parameters<typeof createAdminApplicationHandler>[0]);

    expect((await handler.get(new Request("https://forman.test/api/admin/v1/application"))).status).toBe(401);

    const token = await createSession(database.db);
    const response = await handler.get(new Request("https://forman.test/api/admin/v1/application", {
      headers: { cookie: `__Host-forman_session=${token}` },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ baseUrl: "https://forman.test", isProduction: false });
  });
});
