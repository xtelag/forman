import { randomBytes } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { createTestDatabase } from "../../../helpers/database";
import { loadEnvironment } from "@/server/config/environment";
import { createUnprotectedSource } from "../../../helpers/unprotected-source";
import { getServerSubmissionToken } from "@/server/sources/server-token-service";
import { handleIntakeRequest } from "@/server/submissions/intake-handler";
import { submissions, pipelines, pipelineActions, pipelineRuns, pipelineActionRuns, configuredInboxItems } from "@/server/db/schema";
import { runPipelines } from "@/server/pipelines/pipeline-run-worker";
const environment = loadEnvironment({ FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars", FORMAN_BASE_ORIGIN: "https://forman.example.test", FORMAN_DATABASE_PATH: "/data/forman.sqlite", NODE_ENV: "test", FORMAN_INITIAL_ADMIN_PASSWORD: "change-me", FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars" });
const databases: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => { databases.splice(0).forEach(db => db.dispose()); (globalThis as typeof globalThis & { formanRateLimiters?: Map<number, unknown> }).formanRateLimiters = undefined; });
test("one submit endpoint dispatches by immutable Source type without bypassing Session finalization or M2M auth", async () => {
  const database = createTestDatabase(); databases.push(database);
  const one = await createUnprotectedSource(database.db, { name: "One", type: "one-shot" });
  const session = await createUnprotectedSource(database.db, { name: "Session", type: "session" });
  const m2m = await createUnprotectedSource(database.db, { name: "Trusted", type: "m2m" });
  const call = (sourceId: string, body: unknown, token?: string) => handleIntakeRequest({ database: database.db, environment }, sourceId, new Request(`https://forman.example.test/api/submit/${sourceId}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  expect((await call(one.sourceId, { name: "Ada" })).status).toBe(202);
  expect((await call(m2m.sourceId, { name: "Ada" })).status).toBe(401);
  const token = (await getServerSubmissionToken(database.db, m2m.id))!.token;
  expect((await call(m2m.sourceId, { name: "Ada" }, token)).status).toBe(202);
  const key = randomBytes(32).toString("base64url");
  expect((await call(session.sourceId, { sessionId: key, name: "Ada" })).status).toBe(400);
  expect((await call(session.sourceId, { sessionId: key, operation: "open" })).status).toBe(201);
  expect((await call(session.sourceId, { sessionId: key, operation: "update", revision: 0, operationId: "draft-operation-1234", payload: { name: "Ada" } })).status).toBe(200);
  expect(database.db.select().from(submissions).all()).toHaveLength(2);
  const final = { sessionId: key, operation: "update", revision: 1, operationId: "final-operation-1234", final: true, payload: { name: "Ada" } };
  expect((await call(session.sourceId, final)).status).toBe(200);
  expect((await call(session.sourceId, final)).status).toBe(200);
  expect(database.db.select().from(submissions).all()).toHaveLength(3);
});

test.each(["one-shot", "session", "m2m"] as const)(
  "%s intake reaches Inbox, Email and Webhook without replaying completed Actions",
  async (type) => {
    const database = createTestDatabase(); databases.push(database);
    const source = await createUnprotectedSource(database.db, { name: "Release flow", type });
    const now = new Date();
    database.db.insert(pipelines).values({
      id: "flow", sourceId: source.id, name: "Release flow", enabled: true, createdAt: now, updatedAt: now,
    }).run();
    database.db.insert(pipelineActions).values([
      { type: "inbox" as const, configurationJson: "{}" },
      { type: "email" as const, configurationJson: JSON.stringify({ recipients: ["recipient@example.test"], subject: "Release flow", contentFormat: "formatted" }) },
      { type: "webhook" as const, configurationJson: JSON.stringify({ url: "https://receiver.example.test", timeoutSeconds: 10 }) },
    ].map((action, index) => ({
      ...action, id: "action-" + index, pipelineId: "flow", name: action.type,
      position: index + 1, enabled: true, blocking: false, maximumAttempts: 3,
      conditionMissBehavior: "skip_action" as const, createdAt: now, updatedAt: now,
    }))).run();
    const token = type === "m2m" ? (await getServerSubmissionToken(database.db, source.id))!.token : undefined;
    const call = (body: unknown) => handleIntakeRequest({ database: database.db, environment }, source.sourceId,
      new Request("https://forman.example.test/api/submit/" + source.sourceId, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body),
      }));
    const payload = { name: "Release Example", email: "person@example.test" };
    if (type === "session") {
      const sessionId = randomBytes(32).toString("base64url");
      expect((await call({ sessionId, operation: "open" })).status).toBe(201);
      expect((await call({ sessionId, operation: "update", revision: 0,
        operationId: "release-draft-operation", payload })).status).toBe(200);
      expect(database.db.select().from(pipelineRuns).all()).toEqual([]);
      const final = { sessionId, operation: "update", revision: 1,
        operationId: "release-final-operation", payload, final: true };
      expect((await call(final)).status).toBe(200);
      expect((await call(final)).status).toBe(200);
    } else {
      expect((await call(payload)).status).toBe(202);
    }
    const emails: unknown[] = [];
    const webhooks: unknown[] = [];
    const worker = {
      database: database.db,
      sendEmail: async (email: unknown) => { emails.push(email); },
      sendWebhook: async (request: { body: string }) => {
        webhooks.push(JSON.parse(request.body)); return { status: 200, body: "{}" };
      },
    };
    await runPipelines(worker);
    await runPipelines(worker);
    expect(database.db.select().from(submissions).all()).toHaveLength(1);
    expect(database.db.select().from(configuredInboxItems).all()).toHaveLength(1);
    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toHaveLength(3);
    expect(emails).toEqual([expect.objectContaining({ payload, subject: "Release flow", contentFormat: "formatted" })]);
    expect(webhooks).toEqual([payload]);
  },
);
