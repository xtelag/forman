import { afterEach, describe, expect, test } from "vitest";

import { storeVerifiedBrowserSubmission } from "@/server/submissions/submission-store";
import { storeBrowserSubmission } from "@/server/submissions/submission-store";
import { preparePipelineRuns } from "@/server/pipelines/pipeline-run-service";
import { createSource } from "@/server/sources/source-service";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("storeVerifiedBrowserSubmission", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.dispose();
  });

  test("atomically stores a payload and consumes its challenge once", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const values = {
      createdAt: new Date("2026-08-24T10:15:00.000Z"),
      challengeId: "nonce-1",
      challengeExpiresAt: new Date(Date.now() + 60_000),
      sourceId: form.id,
      payload: { email: ["first@example.test", ""] },
      submissionId: "submission-1",
    };
    const preparedPipelineRuns = await preparePipelineRuns(database.db, {
      createdAt: values.createdAt,
      payload: values.payload,
      sourceId: form.id,
    });

    expect(await storeVerifiedBrowserSubmission(database.db, { ...values, preparedPipelineRuns })).toBe(true);
    expect(await storeVerifiedBrowserSubmission(database.db, { ...values, preparedPipelineRuns })).toBe(false);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({
      count: 1,
    });
  });

  test("stores an unchallenged browser payload", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const createdAt = new Date("2026-08-24T10:15:00.000Z");
    const submissionId = "submission-1";
    const payload = { email: ["a@example.test"] };
    const preparedPipelineRuns = await preparePipelineRuns(database.db, {
      createdAt,
      payload,
      sourceId: form.id,
    });

    await storeBrowserSubmission(database.db, { createdAt, sourceId: form.id, payload, preparedPipelineRuns, submissionId });

    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 1 });
    expect(database.client.prepare("select count(*) as count from pipeline_run").get()).toEqual({ count: 0 });
    expect(database.client.prepare("select count(*) as count from consumed_challenge").get()).toEqual({ count: 0 });
  });
});
