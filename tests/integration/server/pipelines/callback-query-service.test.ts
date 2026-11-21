import { afterEach, describe, expect, test } from "vitest";

import { runMigrations } from "@/server/db/migrate";
import { pipelineActionRuns, pipelineRuns, pipelines, sourceTags, submissions, tags } from "@/server/db/schema";
import { listWaitingCallbacks } from "@/server/pipelines/callback-query-service";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("listWaitingCallbacks", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("returns only waiting Callback Actions in expiry order without callback capabilities", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Leads" });
    const started = new Date("2026-09-03T10:00:00.000Z");
    const later = new Date("2026-09-03T10:05:00.000Z");
    const earlyExpiry = new Date("2026-09-03T11:00:00.000Z");
    const lateExpiry = new Date("2026-09-03T12:00:00.000Z");
    database.db.insert(submissions).values([{ createdAt: started, id: "submission-a", payloadJson: '{"email":"ada@example.test"}', sourceId: source.id }, { createdAt: later, id: "submission-b", payloadJson: "{}", sourceId: source.id }]).run();
    database.db.insert(pipelines).values({ createdAt: started, enabled: true, id: "pipeline", name: "Approval", sourceId: source.id, updatedAt: started }).run();
    database.db.insert(pipelineRuns).values([{ createdAt: started, id: "run-a", pipelineId: "pipeline", pipelineName: "Approval", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission-a", updatedAt: started }, { createdAt: later, id: "run-b", pipelineId: "pipeline", pipelineName: "Approval", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission-b", updatedAt: later }]).run();
    database.db.insert(pipelineActionRuns).values([
      { actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: lateExpiry, callbackToken: "secret-a", conditionMissBehavior: "skip_action", configurationJson: '{"url":"https://example.test"}', createdAt: started, failurePolicy: "cancel", id: "callback-a", inputPayloadJson: '{"email":"ada@example.test"}', maximumAttempts: 1, name: "Await approval", position: 1, runId: "run-a", status: "waiting_callback", type: "callback", updatedAt: started },
      { actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: earlyExpiry, callbackToken: "secret-b", conditionMissBehavior: "skip_action", configurationJson: '{"field":"email.verified"}', createdAt: later, failurePolicy: "cancel", id: "callback-b", inputPayloadJson: "{}", maximumAttempts: 1, name: "Confirm e-mail", position: 1, runId: "run-b", status: "waiting_callback", type: "callback_boolean", updatedAt: later },
      { actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: earlyExpiry, callbackToken: "secret-c", conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: started, failurePolicy: "cancel", id: "webhook", inputPayloadJson: "{}", maximumAttempts: 1, name: "Webhook", position: 2, runId: "run-a", status: "waiting_callback", type: "webhook", updatedAt: started },
      { actionId: null, attemptCount: 1, blocking: true, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: started, failurePolicy: "cancel", id: "complete", inputPayloadJson: "{}", maximumAttempts: 1, name: "Completed", position: 3, runId: "run-a", status: "completed", type: "callback", updatedAt: started },
    ]).run();

    expect((await listWaitingCallbacks(database.db, { from: started.toISOString(), to: later.toISOString() })).items.map((item) => item.id)).toEqual(["callback-a"]);
    const result = await listWaitingCallbacks(database.db);

    expect(result.total).toBe(2);
    expect(result.items).toEqual([
      { actionName: "Confirm e-mail", actionType: "callback_boolean", callbackExpiresAt: earlyExpiry, id: "callback-b", pipelineId: "pipeline", pipelineName: "Approval", runId: "run-b", sourceId: source.id, sourceName: "Leads", waitingSince: later },
      { actionName: "Await approval", actionType: "callback", callbackExpiresAt: lateExpiry, id: "callback-a", pipelineId: "pipeline", pipelineName: "Approval", runId: "run-a", sourceId: source.id, sourceName: "Leads", waitingSince: started },
    ]);
    expect(JSON.stringify(result.items)).not.toContain("secret-");
    expect(JSON.stringify(result.items)).not.toContain("ada@example.test");
  });

  test("filters waiting Callbacks by Source, Pipeline, date and Source tags", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const leads = await createSource(database.db, { type: "one-shot", name: "Leads" });
    const support = await createSource(database.db, { type: "one-shot", name: "Support" });
    const early = new Date("2026-09-01T10:00:00.000Z");
    const later = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(submissions).values([{ createdAt: early, id: "submission-a", payloadJson: "{}", sourceId: leads.id }, { createdAt: later, id: "submission-b", payloadJson: "{}", sourceId: support.id }]).run();
    database.db.insert(pipelines).values([{ createdAt: early, enabled: true, id: "pipeline-a", name: "Lead approval", sourceId: leads.id, updatedAt: early }, { createdAt: later, enabled: true, id: "pipeline-b", name: "Support approval", sourceId: support.id, updatedAt: later }]).run();
    database.db.insert(pipelineRuns).values([{ createdAt: early, id: "run-a", pipelineId: "pipeline-a", pipelineName: "Lead approval", snapshotJson: "{}", sourceId: leads.id, status: "processing", submissionId: "submission-a", updatedAt: early }, { createdAt: later, id: "run-b", pipelineId: "pipeline-b", pipelineName: "Support approval", snapshotJson: "{}", sourceId: support.id, status: "processing", submissionId: "submission-b", updatedAt: later }]).run();
    database.db.insert(pipelineActionRuns).values([{ actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: early, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: early, failurePolicy: "cancel", id: "callback-a", inputPayloadJson: "{}", maximumAttempts: 1, name: "Lead callback", position: 1, runId: "run-a", status: "waiting_callback", type: "callback", updatedAt: early }, { actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: later, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: later, failurePolicy: "cancel", id: "callback-b", inputPayloadJson: "{}", maximumAttempts: 1, name: "Support callback", position: 1, runId: "run-b", status: "waiting_callback", type: "callback", updatedAt: later }]).run();
    database.db.insert(tags).values({ color: "blue", createdAt: later, id: "tag-vip", name: "VIP", updatedAt: later }).run();
    database.db.insert(sourceTags).values({ sourceId: support.id, tagId: "tag-vip" }).run();

    await expect(listWaitingCallbacks(database.db, { from: "2026-09-03", pipelineId: "pipeline-b", sourceId: support.id, tagIds: ["tag-vip"], to: "2026-09-03" })).resolves.toMatchObject({ items: [{ id: "callback-b" }], total: 1 });
  });
});
