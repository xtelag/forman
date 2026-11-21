import { afterEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { getDashboardSummary } from "@/server/dashboard/summary";
import { runMigrations } from "@/server/db/migrate";
import { emailConfirmationSessionActions, emailConfirmationSessions, pipelineActionRuns, pipelineRuns, pipelines, sources, submissions } from "@/server/db/schema";
import { listWaitingCallbacks } from "@/server/pipelines/callback-query-service";
import { listPipelineRunSummaries } from "@/server/pipelines/pipeline-run-query-service";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("getDashboardSummary", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("counts failures in the last 24 hours by failure time and all currently waiting callbacks", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Operations" });
    const createdAt = new Date("2026-09-03T08:00:00Z");
    const now = new Date("2026-09-05T12:00:00Z");
    database.db.insert(submissions).values({ id: "submission", sourceId: source.id, payloadJson: "{}", createdAt }).run();
    database.db.insert(pipelineRuns).values({ id: "run", sourceId: source.id, submissionId: "submission", pipelineName: "Operations", snapshotJson: "{}", status: "processing", createdAt, updatedAt: now }).run();
    const variants = [
      { id: "old", type: "callback", status: "waiting_callback", updatedAt: new Date("2026-09-05T10:59:59Z") },
      { id: "boundary", type: "callback_boolean", status: "waiting_callback", updatedAt: new Date("2026-09-05T11:00:00Z") },
      { id: "recent", type: "callback", status: "waiting_callback", updatedAt: new Date("2026-09-05T11:00:01Z") },
      { id: "failed", type: "webhook", status: "failed", updatedAt: now },
      { id: "failed-boundary", type: "webhook", status: "failed", updatedAt: new Date("2026-09-04T12:00:00Z") },
      { id: "failed-old", type: "webhook", status: "failed", updatedAt: new Date("2026-09-04T11:59:59Z") },
      { id: "failed-future", type: "webhook", status: "failed", updatedAt: new Date("2026-09-05T12:00:01Z") },
      { id: "retry", type: "callback", status: "retry_scheduled", updatedAt: createdAt },
      { id: "complete", type: "callback", status: "completed", updatedAt: createdAt },
      { id: "bypassed", type: "webhook", status: "bypassed", updatedAt: createdAt },
    ] as const;
    for (const [position, variant] of variants.entries()) database.db.insert(pipelineActionRuns).values({ ...variant, runId: "run", name: variant.id, position, blocking: true, failurePolicy: "cancel", maximumAttempts: 2, conditionMissBehavior: "skip_action", configurationJson: "{}", inputPayloadJson: '{"private":"do-not-expose"}', callbackToken: `secret-${variant.id}`, callbackExpiresAt: new Date("2026-09-05T14:00:00Z"), createdAt }).run();

    expect(await getDashboardSummary(database.db, now)).toMatchObject({ failedActionCount: 2, waitingCallbackCount: 3 });
    expect(await listWaitingCallbacks(database.db, {}, now)).toMatchObject({ total: 3 });
    expect(await listPipelineRunSummaries(database.db, { actionStatus: "failed_24h" }, now)).toMatchObject({ total: 1, items: [{ id: "run" }] });
    database.db.update(pipelineActionRuns).set({ updatedAt: createdAt }).where(eq(pipelineActionRuns.status, "failed")).run();
    expect(await getDashboardSummary(database.db, now)).toMatchObject({ failedActionCount: 0 });
    expect(await listPipelineRunSummaries(database.db, { actionStatus: "failed_24h" }, now)).toMatchObject({ total: 0 });
    expect(await listPipelineRunSummaries(database.db, { actionStatus: "failed" }, now)).toMatchObject({ total: 1 });
    const queue = await listWaitingCallbacks(database.db, { olderThanMinutes: 60 }, now);
    expect(queue.total).toBe(2);
    expect(queue.items.map((item) => item.id)).toEqual(["old", "boundary"]);
    expect(queue.items[1].waitingSince).toEqual(new Date("2026-09-05T11:00:00Z"));
    expect(JSON.stringify(queue)).not.toContain("do-not-expose");
    expect(JSON.stringify(queue)).not.toContain("secret-");

    database.db.insert(pipelines).values({ id: "pipeline", sourceId: source.id, name: "Operations", createdAt, updatedAt: createdAt }).run();
    for (const [position, id] of ["confirmation", "missing-session"].entries()) database.db.insert(pipelineActionRuns).values({ id, runId: "run", name: id, position: position + 10, type: "email_confirmation", status: "waiting_callback", blocking: true, maximumAttempts: 1, conditionMissBehavior: "skip_action", configurationJson: "{}", inputPayloadJson: "{}", createdAt, updatedAt: createdAt }).run();
    database.db.insert(emailConfirmationSessions).values({ id: "confirmation-session", sourceId: source.id, pipelineId: "pipeline", recipientFingerprint: "private-recipient", capabilityHash: "private-capability", ownerActionRunId: "confirmation", status: "waiting", expiresAt: new Date("2026-09-05T15:00:00Z"), createdAt, updatedAt: createdAt }).run();
    database.db.insert(emailConfirmationSessionActions).values({ actionRunId: "confirmation", sessionId: "confirmation-session" }).run();
    expect(await getDashboardSummary(database.db, now)).toMatchObject({ waitingCallbackCount: 4 });
    expect(await listWaitingCallbacks(database.db, {}, now)).toMatchObject({ total: 4 });
    expect(await listWaitingCallbacks(database.db, { olderThanMinutes: 60 }, now)).toMatchObject({ total: 3 });
  });

  test("counts active sources and recent submissions in their rolling periods", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const contact = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const survey = await createSource(database.db, { type: "one-shot", name: "Survey" });
    await database.db.update(sources).set({ enabled: false }).where(eq(sources.id, survey.id));
    await database.db.insert(submissions).values([
      { id: "11", sourceId: contact.id, payloadJson: '{"email":"person@example.test"}', createdAt: new Date("2026-01-20T11:00:00Z") },
      { id: "10", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-20T10:00:00Z") },
      { id: "9", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-20T09:00:00Z") },
      { id: "8", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-20T08:00:00Z") },
      { id: "7", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-20T07:00:00Z") },
      { id: "6", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-19T12:00:00Z") },
      { id: "5", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-18T12:00:00Z") },
      { id: "4", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-17T12:00:00Z") },
      { id: "3", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-16T12:00:00Z") },
      { id: "2", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-15T12:00:00Z") },
      { id: "1", sourceId: contact.id, payloadJson: "{}", createdAt: new Date("2026-01-14T12:00:00Z") },
    ]);

    await expect(getDashboardSummary(database.db, new Date("2026-01-20T12:00:00Z"))).resolves.toMatchObject({
      activeSourceCount: 1,
      totalSubmissionCount: 11,
      submissionsLast24Hours: 6,
      submissionsLast7Days: 11,
      submissionsLast30Days: 11,
      recentSubmissions: [
        { id: "11", sourceName: "Contact", payload: { email: "person@example.test" } },
        { id: "10", sourceName: "Contact" },
        { id: "9", sourceName: "Contact" },
        { id: "8", sourceName: "Contact" },
        { id: "7", sourceName: "Contact" },
        { id: "6", sourceName: "Contact" },
        { id: "5", sourceName: "Contact" },
        { id: "4", sourceName: "Contact" },
        { id: "3", sourceName: "Contact" },
        { id: "2", sourceName: "Contact" },
      ],
    });
  });
  test("distinguishes completed Session and One-shot submissions", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, {type: "session", name: "Survey"});
    database.db.insert(submissions).values([
      {id: "session-result", sourceId: source.id, payloadJson: "{}", sessionUpdateCount: 0, sessionRequestCount: 1, createdAt: new Date()},
      {id: "one-shot-result", sourceId: source.id, payloadJson: "{}", createdAt: new Date()},
    ]).run();
    expect((await getDashboardSummary(database.db)).recentSubmissions).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "session-result", type: "session", state: "completed"}),
      expect.objectContaining({id: "one-shot-result", type: "one-shot", state: "completed"}),
    ]));
  });

});
