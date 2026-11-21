import { afterEach, describe, expect, test } from "vitest";

import { createSource } from "@/server/sources/source-service";
import { createTag, replaceSourceTags } from "@/server/tags/tag-service";
import {
  pipelineRuns,
  pipelineActionRuns,
  configuredInboxItems,
  submissions,
} from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { getInboxItem, inboxPreview } from "@/server/inbox/inbox-service";
import { createTestDatabase } from "../../../helpers/database";

describe("Inbox service", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("derives a compact preview from the first non-empty scalar values", () => {
    expect(inboxPreview({ email: "john.forman@example.com", name: "John Forman", note: "Hello" }))
      .toBe("john.forman@example.com · John Forman · Hello");
  });

  test("derives an Inbox preview from an Action payload", () => {
    expect(inboxPreview({
      date: "2026-08-19T18:13:02.452Z",
      meta: { sourceId: "contact" },
      payload: {
        email: "john.forman@example.com",
        name: "John Forman",
        note: "Hello",
      },
    })).toBe("john.forman@example.com · John Forman · Hello");
  });

  test("reads an Inbox Action output and current Source tags dynamically", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const sales = await createTag(database.db, { color: "blue", name: "Sales" });
    const support = await createTag(database.db, { color: "violet", name: "Support" });
    await replaceSourceTags(database.db, form.id, [sales.id]);
    const now = new Date("2026-08-19T12:00:00.000Z");
    database.db.insert(submissions).values({
      createdAt: now,
      sourceId: form.id,
      id: "submission-1",
      payloadJson: "{}",
    }).run();
    database.db.insert(pipelineRuns).values({
      createdAt: now,
      pipelineId: null,
      pipelineName: "Archive contacts",
      id: "run-1",
      snapshotJson: "{}",
      sourceId: form.id,
      submissionId: "submission-1",
      status: "completed",
      updatedAt: now,
    }).run();
    database.db.insert(pipelineActionRuns).values({
      actionId: null,
      attemptCount: 1,
      blocking: false,
      conditionMissBehavior: "skip_action",
      configurationJson: "{}",
      createdAt: now,
      failurePolicy: null,
      id: "action-run-1",
      inputPayloadJson: "{}",
      maximumAttempts: 3,
      name: "Archive",
      position: 1,
      runId: "run-1",
      status: "completed",
      type: "inbox",
      updatedAt: now,
    }).run();
    database.db.insert(configuredInboxItems).values({
      actionName: "Archive",
      createdAt: now,
      pipelineActionRunId: "action-run-1",
      id: "inbox-1",
      payloadJson: JSON.stringify({ email: "john.forman@example.com", name: "John Forman" }),
      sourceId: form.id,
      sourceName: "Contact",
      state: "unread",
      submissionId: "submission-1",
      updatedAt: now,
    }).run();

    expect(await getInboxItem(database.db, "inbox-1")).toMatchObject({
      actionName: "Archive",
      sourcePublicId: form.sourceId,
      preview: "john.forman@example.com · John Forman",
      tags: [sales],
    });
    await replaceSourceTags(database.db, form.id, [support.id]);
    expect(await getInboxItem(database.db, "inbox-1")).toMatchObject({ tags: [support] });
  });
});
