import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "../../../helpers/database";
import { runMigrations } from "@/server/db/migrate";
import { sources } from "@/server/db/schema";
import { createSource } from "@/server/sources/source-service";
import { sessionSettings } from "@/server/source-sessions/session-service";
import { getServerSubmissionToken } from "@/server/sources/server-token-service";
const databases: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.dispose()));
test.each(["one-shot", "session", "m2m"] as const)("creates immutable %s with only its capabilities", async type => {
  const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
  const source = await createSource(database.db, { name: type, type });
  expect(source.type).toBe(type);
  expect(sessionSettings(database.db, source.id).enabled).toBe(type === "session");
  expect(Boolean(await getServerSubmissionToken(database.db, source.id))).toBe(type === "m2m");
  expect(() => database.db.update(sources).set({ type: type === "session" ? "one-shot" : "session" }).where(eq(sources.id, source.id)).run()).toThrow("Source type is immutable");
});

test("admin creation requires a type and updates cannot change it", async () => {
  const database = createTestDatabase(); databases.push(database);
  const { createSession } = await import("@/server/auth/sessions");
  const { createAdminSourcesHandler } = await import("@/server/sources/admin-source-handler");
  const { createAdminSourceLifecycleHandler } = await import("@/server/sources/admin-source-lifecycle-handler");
  const cookie = `__Host-forman_session=${await createSession(database.db)}`;
  const request = (body: unknown) => new Request("https://forman.example.test/api/admin/v1/sources", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await createAdminSourcesHandler({ database: database.db }).create(request({ name: "Missing type" }))).status).toBe(400);
  const source = await createSource(database.db, { name: "Fixed", type: "one-shot" });
  const handler = createAdminSourceLifecycleHandler({ database: database.db });
  expect((await handler.update(request({ enabled: true, type: "session" }), source.sourceId)).status).toBe(400);
  expect((await handler.update(request({ section: "configuration", values: { type: "session" } }), source.sourceId)).status).toBe(400);
  expect(database.db.select().from(sources).where(eq(sources.id, source.id)).get()!.type).toBe("one-shot");
});
