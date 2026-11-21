import { afterEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { pipelineActionRuns, pipelineRuns, submissions } from "@/server/db/schema";
import { createAdminCallbacksHandler } from "@/server/pipelines/admin-callbacks-handler";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("admin callbacks handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("requires an administrator session and serializes waiting Callback details", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Leads" });
    const waitingSince = new Date("2026-09-03T10:00:00.000Z");
    const expiresAt = new Date("2026-09-03T11:00:00.000Z");
    database.db.insert(submissions).values({ createdAt: waitingSince, id: "submission", payloadJson: "{}", sourceId: source.id }).run();
    database.db.insert(pipelineRuns).values({ createdAt: waitingSince, id: "run", pipelineId: null, pipelineName: "Approval", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission", updatedAt: waitingSince }).run();
    database.db.insert(pipelineActionRuns).values({ actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: expiresAt, callbackToken: "do-not-return", conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: waitingSince, failurePolicy: "cancel", id: "callback", inputPayloadJson: "{}", maximumAttempts: 1, name: "Await approval", position: 1, runId: "run", status: "waiting_callback", type: "callback", updatedAt: waitingSince }).run();
    const handler = createAdminCallbacksHandler({ database: database.db });

    expect((await handler.list(new Request("https://forman.example.test/api/admin/v1/callbacks"))).status).toBe(401);
    const session = await createSession(database.db);
    const response = await handler.list(new Request("https://forman.example.test/api/admin/v1/callbacks?page=1&size=10", { headers: { cookie: `__Host-forman_session=${session}` } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [{ actionName: "Await approval", actionType: "callback", callbackExpiresAt: expiresAt.toISOString(), id: "callback", pipelineId: null, pipelineName: "Approval", runId: "run", sourceId: source.id, sourceName: "Leads", waitingSince: waitingSince.toISOString() }],
      total: 1,
    });

    database.db.update(pipelineActionRuns).set({ updatedAt: new Date() }).where(eq(pipelineActionRuns.id, "callback")).run();
    const recent = await handler.list(new Request("https://forman.example.test/api/admin/v1/callbacks?olderThanMinutes=60", { headers: { cookie: `__Host-forman_session=${session}` } }));
    await expect(recent.json()).resolves.toEqual({ items: [], total: 0 });
    database.db.update(pipelineActionRuns).set({ updatedAt: new Date(Date.now() - 61 * 60_000) }).where(eq(pipelineActionRuns.id, "callback")).run();
    const old = await handler.list(new Request("https://forman.example.test/api/admin/v1/callbacks?olderThanMinutes=60", { headers: { cookie: `__Host-forman_session=${session}` } }));
    await expect(old.json()).resolves.toMatchObject({ items: [{ id: "callback" }], total: 1 });
  });
});
