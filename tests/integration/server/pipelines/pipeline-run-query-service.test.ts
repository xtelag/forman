import { afterEach, describe, expect, test, vi } from "vitest";

import { runMigrations } from "@/server/db/migrate";
import { pipelineActionRuns, pipelineRuns, pipelines, sourceTags, submissions, tags } from "@/server/db/schema";
import { listPipelineRunSummaries, listPipelineRunSummariesForSubmission } from "@/server/pipelines/pipeline-run-query-service";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("listPipelineRunSummaries", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("returns compact immutable summaries with Pipeline and Source context", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const createdAt = new Date("2026-09-03T10:00:00.000Z");
    const updatedAt = new Date("2026-09-03T10:01:00.000Z");
    database.db.insert(submissions).values({ createdAt, id: "submission", payloadJson: "{}", sourceId: source.id }).run();
    database.db.insert(pipelines).values({ createdAt, enabled: true, id: "pipeline", name: "Notify CRM", sourceId: source.id, updatedAt }).run();
    database.db.insert(pipelineRuns).values({ createdAt, id: "run", pipelineId: "pipeline", pipelineName: "Notify CRM", snapshotJson: "{}", sourceId: source.id, status: "completed_attention", submissionId: "submission", updatedAt }).run();
    database.db.insert(pipelineActionRuns).values([
      { actionId: null, attemptCount: 1, blocking: true, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt, failurePolicy: "cancel", id: "one", inputPayloadJson: "{}", maximumAttempts: 3, name: "Normalize", position: 1, runId: "run", status: "completed", type: "transformation", updatedAt },
      { actionId: null, attemptCount: 3, blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt, failurePolicy: null, id: "two", inputPayloadJson: "{}", maximumAttempts: 3, name: "Notify", position: 2, runId: "run", status: "failed", type: "webhook", updatedAt },
    ]).run();

    await expect(listPipelineRunSummaries(database.db)).resolves.toEqual({ page: 1, pageSize: 10, total: 1, items: [{
      actionCount: 2,
      completedActionCount: 1,
      createdAt,
      failedActionCount: 1,
      id: "run",
      pipelineId: "pipeline",
      pipelineName: "Notify CRM",
      processingActionCount: 0,
      skippedConditionCount: 0,
      sourceId: source.id,
      sourceName: "Contact",
      status: "completed_attention",
      submissionId: "submission",
      updatedAt,
    }] });
  });

  test("filters global Pipeline Runs by Source, Pipeline, status, date and Source tags", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const contact = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const support = await createSource(database.db, { type: "one-shot", name: "Support" });
    const early = new Date("2026-09-01T10:00:00.000Z");
    const later = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(submissions).values([
      { createdAt: early, id: "submission-a", payloadJson: "{}", sourceId: contact.id },
      { createdAt: later, id: "submission-b", payloadJson: "{}", sourceId: support.id },
    ]).run();
    database.db.insert(pipelines).values([
      { createdAt: early, enabled: true, id: "pipeline-a", name: "Archive", sourceId: contact.id, updatedAt: early },
      { createdAt: later, enabled: true, id: "pipeline-b", name: "Notify", sourceId: support.id, updatedAt: later },
    ]).run();
    database.db.insert(pipelineRuns).values([
      { createdAt: early, id: "run-a", pipelineId: "pipeline-a", pipelineName: "Archive", snapshotJson: "{}", sourceId: contact.id, status: "completed", submissionId: "submission-a", updatedAt: early },
      { createdAt: later, id: "run-b", pipelineId: "pipeline-b", pipelineName: "Notify", snapshotJson: "{}", sourceId: support.id, status: "processing", submissionId: "submission-b", updatedAt: later },
    ]).run();
    database.db.insert(tags).values([{ color: "blue", createdAt: later, id: "tag-vip", name: "VIP", updatedAt: later }, { color: "blue", createdAt: later, id: "tag-other", name: "Other", updatedAt: later }]).run();
    database.db.insert(sourceTags).values([{ sourceId: support.id, tagId: "tag-vip" }, { sourceId: support.id, tagId: "tag-other" }]).run();

    await expect(listPipelineRunSummaries(database.db, { search: "support" })).resolves.toMatchObject({ items: [{ id: "run-b" }], total: 1 });
    await expect(listPipelineRunSummaries(database.db, { search: "arch" })).resolves.toMatchObject({ items: [{ id: "run-a" }], total: 1 });
    await expect(listPipelineRunSummaries(database.db, { search: "no such source" })).resolves.toMatchObject({ items: [], total: 0 });
    await expect(listPipelineRunSummaries(database.db, { from: "2026-09-02", pipelineId: "pipeline-b", sourceId: support.id, status: "processing", tagIds: ["tag-vip"], to: "2026-09-03" })).resolves.toMatchObject({ items: [{ id: "run-b" }], total: 1 });
    await expect(listPipelineRunSummaries(database.db, { tagIds: ["tag-vip", "tag-other"] })).resolves.toMatchObject({ items: [{ id: "run-b" }], total: 1 });
  });
  test("paginates tied timestamps deterministically, scopes counts and clamps empty pages", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(submissions).values([
      { createdAt: now, id: "submission", payloadJson: "{}", sourceId: source.id },
      { createdAt: now, id: "other", payloadJson: "{}", sourceId: source.id },
    ]).run();
    database.db.insert(pipelineRuns).values(Array.from({ length: 31 }, (_, index) => ({
      createdAt: now, id: `run-${String(index).padStart(2, "0")}`, pipelineName: "Archive",
      snapshotJson: '{"secret":"never selected"}', sourceId: source.id,
      status: index === 30 ? "processing" as const : "completed" as const,
      submissionId: index === 30 ? "other" : "submission", updatedAt: now,
    }))).run();
    database.db.insert(pipelineActionRuns).values([
      { blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, id: "action-a", inputPayloadJson: "{}", maximumAttempts: 3, name: "Store", position: 1, runId: "run-19", status: "completed", type: "inbox", updatedAt: now },
      { blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, id: "action-b", inputPayloadJson: "{}", maximumAttempts: 3, name: "Store", position: 1, runId: "run-30", status: "failed", type: "inbox", updatedAt: now },
    ]).run();
    const statements = vi.spyOn(database.client, "prepare");
    const page = await listPipelineRunSummaries(database.db, { page: 2, size: 10, status: "completed" });
    const queries = statements.mock.calls.map(([query]) => query);
    expect(queries.join(" ")).not.toMatch(/snapshot_json|input_payload_json|configuration_json/);
    expect(queries.some((query) => query.includes('order by') && query.includes('limit ?'))).toBe(true);
    expect(queries.some((query) => query.includes('group by') && query.includes('where'))).toBe(true);
    statements.mockRestore();
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 30 });
    expect(page.items.map((run) => run.id)).toEqual(["run-19", "run-18", "run-17", "run-16", "run-15", "run-14", "run-13", "run-12", "run-11", "run-10"]);
    expect(page.items[0]).toMatchObject({ actionCount: 1, completedActionCount: 1, failedActionCount: 0 });
    expect(page.items[1]).toMatchObject({ actionCount: 0, completedActionCount: 0, failedActionCount: 0 });
    expect(JSON.stringify(page)).not.toContain("never selected");
    await expect(listPipelineRunSummaries(database.db, { page: 99, size: 10 })).resolves.toMatchObject({ page: 4, total: 31, items: [{ id: "run-00" }] });
    await expect(listPipelineRunSummaries(database.db, { page: 99, sourceId: "absent" })).resolves.toEqual({ page: 1, pageSize: 10, total: 0, items: [] });
    await expect(listPipelineRunSummaries(database.db)).resolves.toMatchObject({ page: 1, pageSize: 10, total: 31, items: expect.any(Array) });
    expect((await listPipelineRunSummaries(database.db)).items).toHaveLength(10);
    await expect(listPipelineRunSummaries(database.db, { actionStatus: "failed" })).resolves.toMatchObject({ total: 1, items: [{ id: "run-30", failedActionCount: 1 }] });
    const submissionRuns = await listPipelineRunSummariesForSubmission(database.db, "submission");
    expect(submissionRuns).toHaveLength(30);
    expect(submissionRuns.every((run) => run.submissionId === "submission")).toBe(true);
    expect(submissionRuns[10]).toMatchObject({ id: "run-19", actionCount: 1, failedActionCount: 0 });
  });

});
