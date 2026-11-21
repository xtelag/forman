import { afterEach, describe, expect, test } from "vitest";

import { createAdminServerTokenHandler } from "@/server/sources/admin-server-token-handler";
import { createSession } from "@/server/auth/sessions";
import { createSource } from "@/server/sources/source-service";
import { serverSubmissionTokens } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("admin server token handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("reveals the stored token and regenerates it only for an authenticated administrator", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Server intake", type: "m2m" });
    const handler = createAdminServerTokenHandler({ database: database.db });
    await expect(handler.issue(new Request("https://forman.example.test"), form.sourceId)).resolves.toMatchObject({ status: 401 });

    const token = await createSession(database.db);
    await database.db
      .update(serverSubmissionTokens)
      .set({ token: "server-token-for-regression-test", tokenPrefix: "ser" })
      .where(eq(serverSubmissionTokens.sourceId, form.id));
    const current = await handler.get(new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${token}` } }), form.sourceId);
    expect(current.status).toBe(200);
    const currentPayload = await current.json() as { token: string; prefix: string };
    expect(currentPayload).toEqual({
      prefix: "ser",
      token: "server-token-for-regression-test",
    });
    const response = await handler.issue(new Request("https://forman.example.test", { method: "POST", headers: { cookie: `__Host-forman_session=${token}` } }), form.sourceId);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ token: expect.not.stringMatching(new RegExp(`^${currentPayload.token}$`)), prefix: expect.stringMatching(/^[A-Za-z0-9_-]{3}$/) });
  });
});
