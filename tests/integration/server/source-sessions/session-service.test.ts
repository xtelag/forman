import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { randomBytes } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { createTestDatabase } from "../../../helpers/database";
import { createUnprotectedSource } from "../../../helpers/unprotected-source";
import { pipelineActions, pipelines, sourceSessions, submissions, pipelineRuns } from "@/server/db/schema";
import { operateSession, sessionKeyHash, expireSourceSessions } from "@/server/source-sessions/session-service";
const databases: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => databases.splice(0).forEach(d => d.dispose()));
async function setup() {
  const database = createTestDatabase(); databases.push(database);
  const source = await createUnprotectedSource(database.db, { type: "session", name: "Survey" });
  const key = randomBytes(32).toString("base64url");
  const call = (body: unknown, now = new Date()) => operateSession({ database: database.db, source, keyHash: sessionKeyHash(key), body, now });
  return { database, source, key, call };
}
test("resumes across clients, replaces drafts, rejects stale revisions and finishes exactly once", async () => {
  const { database, source, call, key } = await setup();
  const now = new Date();
  database.db.insert(pipelines).values({ id: "p", sourceId: source.id, name: "After survey", createdAt: now, updatedAt: now }).run();
  database.db.insert(pipelineActions).values({ id: "a", pipelineId: "p", name: "Inbox", type: "inbox", position: 1, configurationJson: "{}", createdAt: now, updatedAt: now }).run();
  expect((await call({ operation: "open" })).status).toBe(201);
  const update = { operation: "update", operationId: "first-operation-123", revision: 0, currentPage: 3, payload: { name: "Draft", removed: "value" } };
  const draft = await call(update);
  expect(draft.data?.revision).toBe(1);
  expect(draft.data?.meta.currentPage).toBe(3);
  expect((await call({ operation: "open" })).data?.payload).toEqual(update.payload);
  expect((await call(update)).data?.duplicate).toBe(true);
  expect((await call({ ...update, currentPage: 5 })).status).toBe(409);
  expect((await call({ ...update, operationId: "stale-operation-123" })).status).toBe(409);
  const final = { operation: "update", operationId: "final-operation-123", revision: 1, final: true, payload: { name: "Final" } };
  const result = await call(final);
  expect(result.data?.status).toBe("completed");
  expect(result.data?.meta).toEqual({ currentPage: 3, sessionUpdateCount: 2, sessionRequestCount: 7 });
  expect((await call(final)).data?.submissionId).toBe(result.data?.submissionId);
  expect(database.db.select().from(submissions).all()).toHaveLength(1);
  expect(database.db.select().from(pipelineRuns).all()).toHaveLength(1);
  const saved = database.db.select().from(submissions).get()!;
  expect(JSON.parse(saved.payloadJson)).toEqual({ name: "Final" });
  expect(saved.sessionRequestCount).toBe(7);
  expect(JSON.stringify(database.db.select().from(sourceSessions).all())).not.toContain(key);
});
test("accepts incomplete drafts but validates final data against current Source fields", async () => {
  const { database, source, call } = await setup();
  mutateSourceConfiguration(database.db, source.id, () => ({ fieldDefinitionMode: "json-schema", fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","minLength":1,"maxLength":100}},"required":["email"],"additionalProperties":false}' }));
  await call({ operation: "open" });
  expect((await call({ operation: "update", operationId: "draft-operation-123", revision: 0, payload: {} })).status).toBe(200);
  expect((await call({ operation: "update", operationId: "final-operation-123", revision: 1, final: true, payload: {} })).status).toBe(422);
  expect(database.db.select().from(submissions).all()).toHaveLength(0);
});
test("expires and clears drafts without allowing the old key to create a new session", async () => {
  const { database, call } = await setup();
  const start = new Date("2026-01-01T00:00:00Z");
  await call({ operation: "open" }, start);
  await call({ operation: "update", operationId: "draft-operation-123", revision: 0, payload: { private: "answer" } }, start);
  const expired = new Date("2026-03-01T00:00:00Z");
  expireSourceSessions(database.db, expired);
  expect((await call({ operation: "open" }, expired)).status).toBe(410);
  expect(database.db.select().from(sourceSessions).get()?.payloadJson).toBe("{}");
});

test("concurrent finalization creates one Submission and preserves metadata in the Run snapshot", async () => {
  const { database, source, call } = await setup();
  const now = new Date();
  database.db.insert(pipelines).values({ id: "p", sourceId: source.id, name: "After survey", createdAt: now, updatedAt: now }).run();
  database.db.insert(pipelineActions).values({ id: "a", pipelineId: "p", name: "Inbox", type: "inbox", position: 1, configurationJson: "{}", createdAt: now, updatedAt: now }).run();
  await call({ operation: "open" });
  const final = { operation: "update", operationId: "final-operation-123", revision: 0, final: true, payload: { answer: "A" } };
  const results = await Promise.all([call(final), call(final)]);
  expect(results.every(result => result.status === 200)).toBe(true);
  expect(database.db.select().from(submissions).all()).toHaveLength(1);
  const run = database.db.select().from(pipelineRuns).get()!;
  expect(JSON.parse(run.snapshotJson).meta.sessionUpdateCount).toBe(1);
  expect(JSON.parse(run.snapshotJson).meta.sessionRequestCount).toBe(database.db.select().from(submissions).get()!.sessionRequestCount);
});

test("a failure inserting Pipeline Runs rolls back the final Submission and receipt", async () => {
  const { database, source, call } = await setup();
  const now = new Date();
  database.db.insert(pipelines).values({ id: "p", sourceId: source.id, name: "After survey", createdAt: now, updatedAt: now }).run();
  database.db.insert(pipelineActions).values({ id: "a", pipelineId: "p", name: "Inbox", type: "inbox", position: 1, configurationJson: "{}", createdAt: now, updatedAt: now }).run();
  await call({ operation: "open" });
  database.client.exec("CREATE TRIGGER reject_run BEFORE INSERT ON pipeline_run BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  const final = { operation: "update", operationId: "final-operation-123", revision: 0, final: true, payload: { answer: "A" } };
  await expect(call(final)).rejects.toThrow();
  expect(database.db.select().from(submissions).all()).toHaveLength(0);
  expect(database.db.select().from(sourceSessions).get()!.revision).toBe(0);
  database.client.exec("DROP TRIGGER reject_run");
  expect((await call(final)).data?.status).toBe("completed");
});

