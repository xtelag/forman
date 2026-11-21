import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { randomBytes } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "../../../helpers/database";
import { loadEnvironment } from "@/server/config/environment";
import { createUnprotectedSource } from "../../../helpers/unprotected-source";
import { sourceSessions, sources, submissions } from "@/server/db/schema";
import { handleSessionRequest } from "@/server/source-sessions/public-handler";
import { handleAdminSourceSessions } from "@/server/source-sessions/admin-handler";
const environment = loadEnvironment({ FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars", FORMAN_BASE_ORIGIN: "https://forman.example.test", FORMAN_DATABASE_PATH: "/data/forman.sqlite", NODE_ENV: "test", FORMAN_INITIAL_ADMIN_PASSWORD: "change-me", FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars", FORMAN_TRUST_PROXY: "true" });
const databases: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => { databases.splice(0).forEach(d => d.dispose()); (globalThis as typeof globalThis & { formanRateLimiters?: Map<number, unknown> }).formanRateLimiters = undefined; });
async function setup() {
  const database = createTestDatabase(); databases.push(database);
  const source = await createUnprotectedSource(database.db, { type: "session", name: "Survey" });
  const { updateGlobalSettings } = await import("@/server/config/global-settings");
  await updateGlobalSettings(database.db, { clientBurstLimit: 100 });
  const key = randomBytes(32).toString("base64url");
  const url = `https://forman.example.test/api/submit/${source.sourceId}`;
  const call = (body: unknown, headers: Record<string, string> = {}, method = "POST") => handleSessionRequest({ database: database.db, environment }, source.sourceId, new Request(url, { method, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.17", ...headers }, ...(method === "OPTIONS" ? {} : { body: typeof body === "string" ? body : JSON.stringify({ sessionId: key, ...(body as object) }) }) }));
  return { database, source, key, call, url };
}
test("requires a strong capability, enforces CORS and never returns the key", async () => {
  const { database, source, key, call } = await setup();
  mutateSourceConfiguration(database.db, source.id, () => ({ allowedOrigins: ["https://survey.example"] }));
  expect((await call({ operation: "open", sessionId: "easy" })).status).toBe(401);
  expect((await call({ operation: "open", sessionId: undefined }, { authorization: `Bearer ${key}` })).status).toBe(401);
  expect((await call({ operation: "open" }, { origin: "https://wrong.example" })).status).toBe(403);
  const preflight = await call({}, { origin: "https://survey.example" }, "OPTIONS");
  expect(preflight.headers.get("access-control-allow-headers")).not.toContain("authorization");
  const opened = await call({ operation: "open" }, { origin: "https://survey.example" });
  expect(opened.status).toBe(201);
  expect(opened.headers.get("cache-control")).toBe("no-store");
  expect(await opened.text()).not.toContain(key);
  expect((await call("not-json")).status).toBe(400);
  const read = await (await call({ operation: "read" })).json();
  expect(read.meta.sessionRequestCount).toBe(2);
  const admin = await handleAdminSourceSessions(database.db, source.sourceId, new Request("https://forman.example.test/api/admin/v1/sources/x/sessions"));
  expect(admin.status).toBe(401);
});
test("applies creation protection and disabled Source policy", async () => {
  const { database, source, call } = await setup();
  mutateSourceConfiguration(database.db, source.id, () => ({ honeypotEnabled: true }));
  expect((await call({ operation: "open" })).status).toBe(403);
  expect((await call({ operation: "open", protection: { honeypot: Object.fromEntries(source.honeypotFieldNames.map(name => [name, ""])) } })).status).toBe(201);
  expect((await call({ operation: "read" })).status).toBe(200);
  database.db.update(sources).set({ enabled: false }).where(eq(sources.id, source.id)).run();
  expect((await call({ operation: "read" })).status).toBe(404);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(1);
});
test("requires ALTCHA for new sessions", async () => {
  const { database, source, call } = await setup();
  mutateSourceConfiguration(database.db, source.id, () => ({ altchaEnabled: true }));
  expect((await call({ operation: "open", protection: { altcha: "invalid" } })).status).toBe(403);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(0);
});

test("administrator responses expose settings and answers without capabilities or hashes", async () => {
  const { database, source, key, call } = await setup();
  const { createSession } = await import("@/server/auth/sessions");
  const token = await createSession(database.db);
  await call({ operation: "open" });
  await call({ operation: "update", revision: 0, operationId: "save-answer-123456", payload: { answer: "Saved" } });
  const url = `https://forman.example.test/api/admin/v1/sources/${source.sourceId}/sessions`;
  const headers = { cookie: `__Host-forman_session=${token}` };
  const list = await handleAdminSourceSessions(database.db, source.sourceId, new Request(url, { headers }));
  expect(list.status).toBe(200);
  const body = await list.json();
  expect(body.items).toHaveLength(1);
  expect(body.settings).toEqual({ enabled: true, inactivityDays: 30, completedRetentionDays: 30 });
  const stored = database.db.select().from(sourceSessions).get()!;
  expect(JSON.stringify(body)).not.toContain(key);
  expect(JSON.stringify(body)).not.toContain(stored.keyHash);
  expect(stored.payloadJson).not.toContain(key);
  expect((await call({ operation: "read", sessionId: stored.id })).status).toBe(401);
  expect(JSON.stringify(body)).not.toContain("Saved");
  const detail = await handleAdminSourceSessions(database.db, source.sourceId, new Request(`${url}?id=${body.items[0].id}`, { headers }));
  expect((await detail.json()).payload).toEqual({ answer: "Saved" });
  const other = await createUnprotectedSource(database.db, { type: "session", name: "Other survey" });
  expect((await handleAdminSourceSessions(database.db, other.sourceId, new Request(`${url}?id=${body.items[0].id}`, { headers }))).status).toBe(404);
});

test("administrator changes session retention without changing the Source type", async () => {
  const { database, source } = await setup();
  const { createSession } = await import("@/server/auth/sessions");
  const cookie = `__Host-forman_session=${await createSession(database.db)}`;
  const patch = (body: unknown) => handleAdminSourceSessions(database.db, source.sourceId, new Request(`https://forman.example.test/api/admin/v1/sources/${source.sourceId}/sessions`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }));
  const retention = { inactivityDays: 15, completedRetentionDays: 10 };
  expect(await (await patch(retention)).json()).toEqual({ ...retention, enabled: true });
  expect((await patch({ ...retention, enabled: false })).status).toBe(400);
  expect(database.db.select().from(sources).where(eq(sources.id, source.id)).get()?.type).toBe("session");
});

test.each(["one-shot", "m2m"] as const)("rejects session operations for a %s Source", async type => {
  const database = createTestDatabase(); databases.push(database);
  const source = await createUnprotectedSource(database.db, { name: "Other protocol", type });
  const request = new Request(`https://forman.example.test/api/submit/${source.sourceId}`, { method: "POST", headers: { authorization: `Bearer ${randomBytes(32).toString("base64url")}`, "content-type": "application/json" }, body: JSON.stringify({ operation: "open" }) });
  expect((await handleSessionRequest({ database: database.db, environment }, source.sourceId, request)).status).toBe(404);
  expect(database.db.select().from(sourceSessions).all()).toEqual([]);
});

test("consumes an ALTCHA challenge once and lets a resumed session skip repeated verification", async () => {
  const { database, source, call } = await setup();
  const { createAltchaChallenge } = await import("@/server/anti-abuse/altcha");
  const { solveChallenge } = await import("altcha-lib/v1");
  mutateSourceConfiguration(database.db, source.id, () => ({ altchaEnabled: true }));
  const challenge = await createAltchaChallenge({ sourceId: source.sourceId, secret: environment.altchaSecret, workFactor: 1 });
  const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
  const altcha = Buffer.from(JSON.stringify({ ...challenge, ...solution! })).toString("base64url");
  expect((await call({ operation: "open", protection: { altcha } })).status).toBe(201);
  expect((await call({ operation: "open" })).status).toBe(200);
  const secondKey = randomBytes(32).toString("base64url");
  expect((await call({ operation: "open", sessionId: secondKey, protection: { altcha } })).status).toBe(403);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(1);
});

test("normal navigation and refreshes do not consume creation limits", async () => {
  const { database, source, call } = await setup();
  const { updateGlobalSettings } = await import("@/server/config/global-settings");
  await updateGlobalSettings(database.db, { clientBurstLimit: 3 });
  mutateSourceConfiguration(database.db, source.id, () => ({ submissionRateLimitPerMinute: 1 }));
  expect((await call({ operation: "open" })).status).toBe(201);
  for (let revision = 0; revision < 5; revision++) {
    expect((await call({ operation: "update", operationId: `navigation-${revision}-12345678`, revision, currentPage: revision + 1, payload: { answer: "Saved" } })).status).toBe(200);
    expect((await call({ operation: "read" })).status).toBe(200);
  }
  expect((await call({ operation: "open", sessionId: randomBytes(32).toString("base64url") })).status).toBe(429);
  expect((await call({ operation: "read" })).status).toBe(200);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(1);
});

test("existing sessions retain body limits and a separate burst guard", async () => {
  const { database, source, call } = await setup();
  await call({ operation: "open" });
  mutateSourceConfiguration(database.db, source.id, () => ({ maxBodyBytes: 256 }));
  expect((await call({ operation: "update", operationId: "oversized-12345678", revision: 0, payload: { answer: "x".repeat(1000) } })).status).toBe(413);
  for (let i = 0; i < 20; i++) expect((await call({ operation: "read" })).status).toBe(200);
  const limited = await call({ operation: "read" });
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("10");
  expect(limited.headers.get("access-control-expose-headers")).toContain("retry-after");
  expect(database.db.select().from(sourceSessions).get()!.payloadJson).toBe("{}");
});

async function auditProof(sourceId: string, ttlSeconds = 1200) {
  const { createAltchaChallenge } = await import("@/server/anti-abuse/altcha");
  const { solveChallenge } = await import("altcha-lib/v1");
  const challenge = await createAltchaChallenge({ sourceId, secret: environment.altchaSecret, workFactor: 1, ttlSeconds });
  const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
  return Buffer.from(JSON.stringify({ ...challenge, ...solution! })).toString("base64url");
}

test.each(["missing", "invalid", "expired", "wrong-source"])("combined protection rejects %s ALTCHA without creating a draft", async kind => {
  const { database, source, call } = await setup();
  mutateSourceConfiguration(database.db, source.id, () => ({ altchaEnabled: true, honeypotEnabled: true }));
  const altcha = kind === "missing" ? undefined : kind === "invalid" ? "invalid"
    : await auditProof(kind === "wrong-source" ? "another-source" : source.sourceId, kind === "expired" ? -60 : 1200);
  expect((await call({ operation: "open", protection: { honeypot: Object.fromEntries(source.honeypotFieldNames.map(name => [name, ""])), altcha } })).status).toBe(403);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(0);
});

test.each([undefined, "bot"])("combined protection rejects honeypot %s even with valid ALTCHA", async honeypot => {
  const { database, source, call } = await setup();
  mutateSourceConfiguration(database.db, source.id, () => ({ altchaEnabled: true, honeypotEnabled: true }));
  const altcha = await auditProof(source.sourceId);
  expect((await call({ operation: "open", protection: { honeypot, altcha } })).status).toBe(403);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(0);
  // A rejected honeypot must not consume an otherwise valid proof.
  expect((await call({ operation: "open", protection: { honeypot: Object.fromEntries(source.honeypotFieldNames.map(name => [name, ""])), altcha } })).status).toBe(201);
});

test("combined protections apply only at creation through draft save and finalization", async () => {
  const { database, source, call } = await setup();
  mutateSourceConfiguration(database.db, source.id, () => ({ altchaEnabled: true, honeypotEnabled: true }));
  const altcha = await auditProof(source.sourceId);
  expect((await call({ operation: "open", protection: { honeypot: Object.fromEntries(source.honeypotFieldNames.map(name => [name, ""])), altcha } })).status).toBe(201);
  expect((await call({ operation: "read" })).status).toBe(200);
  expect((await call({ operation: "update", operationId: "audit-draft-123456", revision: 0, payload: { answer: "Draft" } })).status).toBe(200);
  const final = { operation: "update", operationId: "audit-final-123456", revision: 1, final: true, payload: { answer: "Done" } };
  const finished = await (await call(final)).json();
  expect(finished.status).toBe("completed");
  expect((await (await call(final)).json()).submissionId).toBe(finished.submissionId);
  const rows = database.db.select().from(submissions).all();
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].payloadJson)).toEqual({ answer: "Done" });
  expect(database.db.select().from(sourceSessions).get()!.payloadJson).toBe('{"answer":"Done"}');
});

test.each([1, 2, 10])("requires exactly %i configured honeypots", async count => {
  const { database, source, key, call } = await setup();
  const names = Array.from({ length: count }, (_, i) => `trap_${i}`);
  mutateSourceConfiguration(database.db, source.id, () => ({ honeypotEnabled: true, honeypotFieldNames: names }));
  const good = Object.fromEntries(names.map(name => [name, ""]));
  for (const honeypot of [{}, { ...good, [names[0]]: "bot" }, { ...good, extra: "" }]) {
    const result = await call({ operation: "open", protection: { honeypot } });
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: "Verification failed" });
  }
  const raw = JSON.stringify({ sessionId: key, operation: "open", protection: { honeypot: good } }).replace('"trap_0":""', '"trap_0":"bot","trap_0":""');
  expect((await call(raw)).status).toBe(403);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(0);
  expect((await call({ operation: "open", protection: { honeypot: good } })).status).toBe(201);
});
