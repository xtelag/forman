import { afterEach, describe, expect, test } from "vitest";

import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";
import { pipelineRuns, pipelineActionRuns, pipelines, submissions } from "@/server/db/schema";
import { createTestDatabase } from "../../../helpers/database";
import { createSource } from "@/server/sources/source-service";

describe("configured Pipeline Runs handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("requires an administrator session and lists no runs initially", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const handler = createAdminPipelineRunsHandler({ database: database.db });
    expect((await handler.list("flow-1", new Request("https://forman.example.test"))).status).toBe(401);
    const session = await createSession(database.db);
    const response = await handler.list("flow-1", new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${session}` } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [], page: 1, pageSize: 10, total: 0 });
  });

  test("lists Pipeline Runs globally with their Pipeline and Data Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(submissions).values({ createdAt: now, id: "submission", payloadJson: "{}", sourceId: source.id }).run();
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "pipeline", name: "CRM", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, id: "run", pipelineId: "pipeline", pipelineName: "CRM", snapshotJson: "{}", sourceId: source.id, status: "completed", submissionId: "submission", updatedAt: now }).run();
    const session = await createSession(database.db);

    const response = await createAdminPipelineRunsHandler({ database: database.db }).listAll(
      new Request("https://forman.example.test/api/admin/v1/pipeline-runs", { headers: { cookie: `__Host-forman_session=${session}` } }),
    );

    await expect(response.json()).resolves.toMatchObject({ items: [{ id: "run", pipelineName: "CRM", sourceId: source.id, sourceName: "Contact", submissionId: "submission" }] });
  });

  test("passes global Pipeline Run filters from the request URL", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(submissions).values({ createdAt: now, id: "submission", payloadJson: "{}", sourceId: source.id }).run();
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "pipeline", name: "CRM", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, id: "run", pipelineId: "pipeline", pipelineName: "CRM", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission", updatedAt: now }).run();
    const session = await createSession(database.db);

    const response = await createAdminPipelineRunsHandler({ database: database.db }).listAll(
      new Request(`https://forman.example.test/api/admin/v1/pipeline-runs?sourceId=${source.id}&pipelineId=pipeline&status=processing&from=2026-09-03&to=2026-09-03`, { headers: { cookie: `__Host-forman_session=${session}` } }),
    );

    await expect(response.json()).resolves.toMatchObject({ items: [{ id: "run" }] });
    const noMatch = await createAdminPipelineRunsHandler({ database: database.db }).listAll(
      new Request("https://forman.example.test/api/admin/v1/pipeline-runs?status=completed", { headers: { cookie: `__Host-forman_session=${session}` } }),
    );
    await expect(noMatch.json()).resolves.toEqual({ items: [], page: 1, pageSize: 10, total: 0 });
    database.db.insert(pipelineActionRuns).values({ id: "failed-action", runId: "run", name: "Notify", position: 0, type: "webhook", status: "failed", blocking: false, maximumAttempts: 1, conditionMissBehavior: "skip_action", configurationJson: "{}", inputPayloadJson: "{}", createdAt: now, updatedAt: new Date() }).run();
    const recentFailures = () => createAdminPipelineRunsHandler({ database: database.db }).listAll(
      new Request("https://forman.example.test/api/admin/v1/pipeline-runs?actionStatus=failed_24h", { headers: { cookie: `__Host-forman_session=${session}` } }),
    );
    await expect((await recentFailures()).json()).resolves.toMatchObject({ total: 1, items: [{ id: "run" }] });
    database.db.update(pipelineActionRuns).set({ updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1_000) }).run();
    await expect((await recentFailures()).json()).resolves.toMatchObject({ total: 0, items: [] });
  });

  test("normalizes pagination and keeps a Pipeline route scoped even with conflicting filters", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(submissions).values({ createdAt: now, id: "submission", payloadJson: "{}", sourceId: source.id }).run();
    database.db.insert(pipelines).values(Array.from({ length: 12 }, (_, index) => ({ createdAt: now, enabled: true, id: `pipeline-${index}`, name: `CRM ${index}`, sourceId: source.id, updatedAt: now }))).run();
    database.db.insert(pipelineRuns).values(Array.from({ length: 12 }, (_, index) => ({ createdAt: now, id: `run-${String(index).padStart(2, "0")}`, pipelineId: `pipeline-${index}`, pipelineName: "CRM", snapshotJson: "{}", sourceId: source.id, status: "completed" as const, submissionId: "submission", updatedAt: now }))).run();
    const session = await createSession(database.db);
    const request = (query: string) => new Request(`https://forman.example.test/api/admin/v1/pipeline-runs?${query}`, { headers: { cookie: `__Host-forman_session=${session}` } });
    const handler = createAdminPipelineRunsHandler({ database: database.db });
    await expect((await handler.listAll(request("page=2&size=10"))).json()).resolves.toMatchObject({ page: 2, pageSize: 10, total: 12, items: [{ id: "run-01" }, { id: "run-00" }] });
    await expect((await handler.listAll(request("page=-1&size=99999"))).json()).resolves.toMatchObject({ page: 1, pageSize: 10, total: 12 });
    await expect((await handler.list("pipeline-0", request("pipelineId=pipeline-1&page=2&size=10"))).json()).resolves.toEqual({ page: 1, pageSize: 10, total: 1, items: [{ createdAt: now.toISOString(), id: "run-00", submissionId: "submission", status: "completed", summary: "0 / 0" }] });
  });

  test("requeues only a failed Action Run", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const session = await createSession(database.db);
    const now = new Date();
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    database.db.insert(submissions).values({ createdAt: now, id: "submission", payloadJson: "{}", sourceId: source.id }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, pipelineId: null, pipelineName: "Process", id: "run-1", snapshotJson: "{}", sourceId: source.id, status: "completed_attention", submissionId: "submission", updatedAt: now }).run();
    database.db.insert(pipelineActionRuns).values({ actionId: null, attemptCount: 3, blocking: true, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, failurePolicy: "cancel", id: "action-1", inputPayloadJson: "{}", maximumAttempts: 3, name: "Webhook", position: 1, runId: "run-1", status: "failed", type: "webhook", updatedAt: now }).run();
    const response = await createAdminPipelineRunsHandler({ database: database.db }).retry("action-1", new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${session}` }, method: "POST" }));
    expect(response.status).toBe(202);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ attemptCount: 0, errorSummary: null, status: "pending" }]);
    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "processing" }]);
  });

  test("returns one Run with ordered Action state and safe payloads", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const session = await createSession(database.db);
    const startedAt = new Date("2026-09-02T10:00:00.000Z");
    const updatedAt = new Date("2026-09-02T10:01:00.000Z");
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    database.db.insert(submissions).values({ createdAt: startedAt, id: "submission", payloadJson: "{}", sourceId: source.id }).run();
    database.db.insert(pipelines).values({ createdAt: startedAt, enabled: true, id: "flow-1", name: "Verify contact", sourceId: source.id, updatedAt }).run();
    database.db.insert(pipelineRuns).values({ createdAt: startedAt, pipelineId: "flow-1", pipelineName: "Verify contact", id: "run-1", snapshotJson: "{}", sourceId: source.id, status: "completed_attention", submissionId: "submission", updatedAt }).run();
    database.db.insert(pipelineActionRuns).values([
      { actionId: null, attemptCount: 1, blocking: true, conditionMissBehavior: "skip_action", configurationJson: '{"url":"https://secret.example.test"}', createdAt: startedAt, failurePolicy: "cancel", id: "action-1", inputPayloadJson: '{"email":"ada@example.test"}', maximumAttempts: 3, name: "Enrich", outputPayloadJson: '{"email":"ada@example.test","verified":true}', position: 1, runId: "run-1", status: "completed", type: "webhook", updatedAt },
      { actionId: null, attemptCount: 3, blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: startedAt, errorSummary: "Request to https://secret.example.test failed", failurePolicy: null, id: "action-2", inputPayloadJson: '{"email":"ada@example.test","verified":true}', maximumAttempts: 3, name: "Notify sales", position: 2, runId: "run-1", status: "failed", type: "email", updatedAt },
    ]).run();

    const response = await createAdminPipelineRunsHandler({ database: database.db }).get("flow-1", "run-1", new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${session}` } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      actions: [
        { attemptCount: 1, callbackExpiresAt: null, errorSummary: null, id: "action-1", inputPayload: { email: "ada@example.test" }, maximumAttempts: 3, name: "Enrich", nextAttemptAt: null, outputPayload: { email: "ada@example.test", verified: true }, position: 1, status: "completed", type: "webhook", updatedAt: updatedAt.toISOString() },
        { attemptCount: 3, callbackExpiresAt: null, errorSummary: "E-mail Action failed.", id: "action-2", inputPayload: { email: "ada@example.test", verified: true }, maximumAttempts: 3, name: "Notify sales", nextAttemptAt: null, outputPayload: null, position: 2, status: "failed", type: "email", updatedAt: updatedAt.toISOString() },
      ],
      createdAt: startedAt.toISOString(),
      pipelineId: "flow-1",
      pipelineName: "Verify contact",
      id: "run-1",
      status: "completed_attention",
      submissionId: "submission",
      updatedAt: updatedAt.toISOString(),
    });
  });

  test("opens a Run directly and scopes it to its Submission", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const session = await createSession(database.db);
    const now = new Date("2026-09-03T10:00:00.000Z");
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    database.db.insert(submissions).values([
      { createdAt: now, id: "submission-a", payloadJson: "{}", sourceId: source.id },
      { createdAt: now, id: "submission-b", payloadJson: "{}", sourceId: source.id },
    ]).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, id: "run-1", pipelineId: null, pipelineName: "Archive", snapshotJson: "{}", sourceId: source.id, status: "completed", submissionId: "submission-a", updatedAt: now }).run();
    const handler = createAdminPipelineRunsHandler({ database: database.db });
    const request = new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${session}` } });

    expect((await handler.getById("run-1", request)).status).toBe(200);
    expect((await handler.getForSubmission("submission-a", "run-1", request)).status).toBe(200);
    expect((await handler.getForSubmission("submission-b", "run-1", request)).status).toBe(404);
  });
});
