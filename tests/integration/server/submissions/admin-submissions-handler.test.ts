import { afterEach, describe, expect, test } from "vitest";

import { createAdminSubmissionsHandler } from "@/server/submissions/admin-submissions-handler";
import { createSession } from "@/server/auth/sessions";
import { createSource } from "@/server/sources/source-service";
import { createTag, replaceSourceTags } from "@/server/tags/tag-service";
import { pipelineActionRuns, pipelineRuns, pipelines, submissions } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("admin submissions handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("deletes 250 scoped results in bounded batches, preserving exclusions and later arrivals", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Bulk QA" });
    const other = await createSource(database.db, { type: "one-shot", name: "Other" });
    database.db.insert(submissions).values(Array.from({ length: 250 }, (_, index) => ({
      id: "bulk-" + index, sourceId: source.id, payloadJson: "{}", createdAt: new Date("2026-01-01"),
    }))).run();
    const token = await createSession(database.db);
    const handler = createAdminSubmissionsHandler({ database: database.db });
    const headers = { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" };
    const selection = { type: "filter", filter: { sourceId: source.id, state: "completed" }, excludedIds: ["bulk-249"], snapshotBefore: "2026-01-02T00:00:00.000Z" };
    const remove = () => handler.remove(new Request("https://forman.test/api/admin/v1/submissions", { method: "DELETE", headers, body: JSON.stringify(selection) })).then(r => r.json());
    expect(await remove()).toEqual({ deleted: 100, hasMore: true });
    database.db.insert(submissions).values([
      { id: "new-arrival", sourceId: source.id, payloadJson: "{}", createdAt: new Date("2026-01-03") },
      { id: "other-source", sourceId: other.id, payloadJson: "{}", createdAt: new Date("2026-01-01") },
    ]).run();
    expect(await remove()).toEqual({ deleted: 100, hasMore: true });
    expect(await remove()).toEqual({ deleted: 49, hasMore: false });
    expect(await remove()).toEqual({ deleted: 0, hasMore: false });
    expect(database.db.select({ id: submissions.id }).from(submissions).all().map(r => r.id).sort()).toEqual(["bulk-249", "new-arrival", "other-source"]);
  });

  test("requires an administrator session before returning captured payloads", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const tag = await createTag(database.db, { color: "teal", name: "Website" });
    await replaceSourceTags(database.db, form.id, [tag.id]);
    await database.db.insert(submissions).values({ id: "submission", sourceId: form.id, payloadJson: '{"email":["a@example.test"]}', createdAt: new Date("2026-08-13T10:00:00.000Z") });
    const handler = createAdminSubmissionsHandler({ database: database.db });

    const unauthorized = await handler.list(new Request("https://forman.example.test/api/admin/v1/submissions"));
    expect(unauthorized.status).toBe(401);

    const token = await createSession(database.db);
    const authorized = await handler.list(new Request("https://forman.example.test/api/admin/v1/submissions?search=email", { headers: { cookie: `__Host-forman_session=${token}` } }));
    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toStrictEqual({
      snapshotBefore: expect.any(String),
      deletableTotal: 1,
      items: [{
        type: "one-shot",
        state: "completed",
        createdAt: "2026-08-13T10:00:00.000Z",
        sourceId: form.id,
        sourcePublicId: form.sourceId,
        sourceName: "Contact",
        id: "submission",
        payload: { email: ["a@example.test"] },
        referer: null,
        tags: [tag],
        userAgent: null,
      }],
      total: 1,
    });
  });

  test("lists and bulk-deletes submissions matching any selected tag", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const [sales, support] = await Promise.all([
      createTag(database.db, { color: "blue", name: "Sales" }),
      createTag(database.db, { color: "violet", name: "Support" }),
    ]);
    const [salesForm, supportForm, otherForm] = await Promise.all([
      createSource(database.db, { type: "one-shot", name: "Sales form" }),
      createSource(database.db, { type: "one-shot", name: "Support form" }),
      createSource(database.db, { type: "one-shot", name: "Other form" }),
    ]);
    await Promise.all([
      replaceSourceTags(database.db, salesForm.id, [sales.id]),
      replaceSourceTags(database.db, supportForm.id, [support.id]),
    ]);
    await database.db.insert(submissions).values([
      { id: "sales", sourceId: salesForm.id, payloadJson: "{}", createdAt: new Date("2026-08-13T10:00:00.000Z") },
      { id: "support", sourceId: supportForm.id, payloadJson: "{}", createdAt: new Date("2026-08-13T11:00:00.000Z") },
      { id: "other", sourceId: otherForm.id, payloadJson: "{}", createdAt: new Date("2026-08-13T12:00:00.000Z") },
    ]);
    const token = await createSession(database.db);
    const handler = createAdminSubmissionsHandler({ database: database.db });
    const headers = { cookie: `__Host-forman_session=${token}` };

    const listed = await handler.list(
      new Request(`https://forman.example.test/api/admin/v1/submissions?tagId=${sales.id}&tagId=${support.id}`, { headers }),
    );
    await expect(listed.json()).resolves.toMatchObject({
      items: [{ id: "support" }, { id: "sales" }],
      total: 2,
    });

    const removed = await handler.remove(new Request("https://forman.example.test/api/admin/v1/submissions", {
      body: JSON.stringify({ excludedIds: [], filter: { tagIds: [sales.id, support.id] }, snapshotBefore: "2026-08-13T13:00:00.000Z", type: "filter" }),
      headers: { "content-type": "application/json", ...headers },
      method: "DELETE",
    }));
    await expect(removed.json()).resolves.toEqual({ deleted: 2, hasMore: false });
    expect(await database.db.select({ id: submissions.id }).from(submissions)).toEqual([
      { id: "other" },
    ]);
  });

  test("deletes selected submissions only for an administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await database.db.insert(submissions).values([
      { id: "keep", sourceId: form.id, payloadJson: '{"email":["keep@example.test"]}', createdAt: new Date("2026-08-13T10:00:00.000Z") },
      { id: "delete", sourceId: form.id, payloadJson: '{"email":["delete@example.test"]}', createdAt: new Date("2026-08-13T11:00:00.000Z") },
    ]);
    const handler = createAdminSubmissionsHandler({ database: database.db });
    const request = new Request("https://forman.example.test/api/admin/v1/submissions", {
      body: JSON.stringify({ ids: ["delete"], type: "ids" }),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });

    expect((await handler.remove(request)).status).toBe(401);

    const token = await createSession(database.db);
    const authorized = await handler.remove(new Request(request, {
      headers: { "content-type": "application/json", cookie: `__Host-forman_session=${token}` },
    }));

    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toEqual({ deleted: 1 });
    expect(await database.db.select({ id: submissions.id }).from(submissions)).toEqual([
      { id: "keep" },
    ]);
  });

  test("deletes every submission matching the current filter", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await database.db.insert(submissions).values([
      { id: "first", sourceId: form.id, payloadJson: '{"kind":["remove"]}', createdAt: new Date("2026-08-13T10:00:00.000Z") },
      { id: "second", sourceId: form.id, payloadJson: '{"kind":["remove"]}', createdAt: new Date("2026-08-13T11:00:00.000Z") },
      { id: "keep", sourceId: form.id, payloadJson: '{"kind":["keep"]}', createdAt: new Date("2026-08-13T12:00:00.000Z") },
    ]);
    const token = await createSession(database.db);
    const handler = createAdminSubmissionsHandler({ database: database.db });
    const response = await handler.remove(new Request("https://forman.example.test/api/admin/v1/submissions", {
      body: JSON.stringify({ excludedIds: [], filter: { search: "remove" }, snapshotBefore: "2026-08-13T13:00:00.000Z", type: "filter" }),
      headers: { "content-type": "application/json", cookie: `__Host-forman_session=${token}` },
      method: "DELETE",
    }));

    await expect(response.json()).resolves.toEqual({ deleted: 2, hasMore: false });
    expect(await database.db.select({ id: submissions.id }).from(submissions)).toEqual([
      { id: "keep" },
    ]);
  });

  test("deletes a captured filtered selection while preserving exclusions and newer submissions", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await database.db.insert(submissions).values([
      { id: "delete", sourceId: form.id, payloadJson: '{"kind":["remove"]}', createdAt: new Date("2026-08-13T10:00:00.000Z") },
      { id: "excluded", sourceId: form.id, payloadJson: '{"kind":["remove"]}', createdAt: new Date("2026-08-13T11:00:00.000Z") },
      { id: "keep", sourceId: form.id, payloadJson: '{"kind":["keep"]}', createdAt: new Date("2026-08-13T11:00:00.000Z") },
      { id: "new", sourceId: form.id, payloadJson: '{"kind":["remove"]}', createdAt: new Date("2026-08-13T13:00:00.000Z") },
    ]);
    const token = await createSession(database.db);
    const handler = createAdminSubmissionsHandler({ database: database.db });
    const response = await handler.remove(new Request("https://forman.example.test/api/admin/v1/submissions", {
      body: JSON.stringify({
        excludedIds: ["excluded"],
        filter: { search: "remove" },
        snapshotBefore: "2026-08-13T12:00:00.000Z",
        type: "filter",
      }),
      headers: { "content-type": "application/json", cookie: `__Host-forman_session=${token}` },
      method: "DELETE",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 1, hasMore: false });
    expect(
      (await database.db.select({ id: submissions.id }).from(submissions))
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["excluded", "keep", "new"]);
  });

  test("returns and deletes one submission only for an administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await database.db.insert(submissions).values({
      id: "submission",
      sourceId: form.id,
      payloadJson: '{"email":["person@example.test"]}',
      createdAt: new Date("2026-08-13T10:00:00.000Z"),
    });
    const handler = createAdminSubmissionsHandler({ database: database.db });

    expect((await handler.get(new Request("https://forman.test/api/admin/v1/submissions/submission"), "submission")).status).toBe(401);
    expect((await handler.delete(new Request("https://forman.test/api/admin/v1/submissions/submission", { method: "DELETE" }), "submission")).status).toBe(401);

    const token = await createSession(database.db);
    const headers = { cookie: `__Host-forman_session=${token}` };
    const detail = await handler.get(new Request("https://forman.test/api/admin/v1/submissions/submission", { headers }), "submission");
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toStrictEqual({
      type: "one-shot",
      state: "completed",
      id: "submission",
      createdAt: "2026-08-13T10:00:00.000Z",
      sourceId: form.id,
      sourcePublicId: form.sourceId,
      sourceName: "Contact",
      payload: { email: ["person@example.test"] },
      pipelineRuns: [],
      referer: null,
      tags: [],
      userAgent: null,
    });
    expect((await handler.get(new Request("https://forman.test/api/admin/v1/submissions/missing", { headers }), "missing")).status).toBe(404);
    expect((await handler.delete(new Request("https://forman.test/api/admin/v1/submissions/submission", { headers, method: "DELETE" }), "submission")).status).toBe(204);
    expect((await handler.delete(new Request("https://forman.test/api/admin/v1/submissions/missing", { headers, method: "DELETE" }), "missing")).status).toBe(404);
  });

  test("includes immutable Pipeline Run summaries on Submission detail", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const createdAt = new Date("2026-09-03T09:00:00.000Z");
    const updatedAt = new Date("2026-09-03T09:01:00.000Z");
    database.db.insert(submissions).values({ createdAt, id: "submission", payloadJson: '{"email":"ada@example.test"}', sourceId: source.id }).run();
    database.db.insert(pipelines).values({ createdAt, enabled: true, id: "pipeline", name: "Verify contact", sourceId: source.id, updatedAt }).run();
    database.db.insert(pipelineRuns).values({ createdAt, id: "run", pipelineId: "pipeline", pipelineName: "Verify contact", snapshotJson: "{}", sourceId: source.id, status: "completed_attention", submissionId: "submission", updatedAt }).run();
    database.db.insert(pipelineActionRuns).values([
      { actionId: null, attemptCount: 1, blocking: true, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt, failurePolicy: "cancel", id: "completed", inputPayloadJson: "{}", maximumAttempts: 3, name: "Normalize", position: 1, runId: "run", status: "completed", type: "transformation", updatedAt },
      { actionId: null, attemptCount: 0, blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt, failurePolicy: null, id: "skipped", inputPayloadJson: "{}", maximumAttempts: 3, name: "Send", position: 2, runId: "run", status: "skipped_condition", type: "email", updatedAt },
    ]).run();
    const session = await createSession(database.db);

    const response = await createAdminSubmissionsHandler({ database: database.db }).get(
      new Request("https://forman.test/api/admin/v1/submissions/submission", { headers: { cookie: `__Host-forman_session=${session}` } }),
      "submission",
    );

    await expect(response.json()).resolves.toMatchObject({
      id: "submission",
      pipelineRuns: [{
        actionCount: 2,
        completedActionCount: 1,
        failedActionCount: 0,
        id: "run",
        pipelineId: "pipeline",
        pipelineName: "Verify contact",
        processingActionCount: 0,
        skippedConditionCount: 1,
        status: "completed_attention",
      }],
    });
  });

  test("returns scalar and mixed-array values stored by an earlier compatible writer", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const payload = {
      accepted: false,
      count: 0,
      empty: "",
      email: "person@example.test",
      values: ["sources", 2, true],
    };
    await database.db.insert(submissions).values({
      id: "scalar-values",
      sourceId: form.id,
      payloadJson: JSON.stringify(payload),
      createdAt: new Date("2026-08-13T10:00:00.000Z"),
    });
    const token = await createSession(database.db);
    const handler = createAdminSubmissionsHandler({ database: database.db });
    const headers = { cookie: `__Host-forman_session=${token}` };

    const list = await handler.list(new Request("https://forman.test/api/admin/v1/submissions", { headers }));
    await expect(list.json()).resolves.toMatchObject({ items: [{ id: "scalar-values", payload }] });
    const detail = await handler.get(new Request("https://forman.test/api/admin/v1/submissions/scalar-values", { headers }), "scalar-values");
    await expect(detail.json()).resolves.toMatchObject({ id: "scalar-values", payload });
  });
});
