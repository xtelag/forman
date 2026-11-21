import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { submissions } from "@/server/db/schema";
import { afterEach, describe, expect, test } from "vitest";

import { solveChallenge } from "altcha-lib/v1";

import { createAltchaChallenge } from "@/server/anti-abuse/altcha";
import { loadEnvironment } from "@/server/config/environment";
import { updateGlobalSettings } from "@/server/config/global-settings";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { handleBrowserSubmission } from "@/server/submissions/browser-handler";
import { createUnprotectedSource } from "../../../helpers/unprotected-source";
import { createPage } from "@/server/pages/page-service";
import { pipelineRuns, pipelineActionRuns, pipelines, pipelineActions } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

const environment = loadEnvironment({
  NODE_ENV: "test",
  FORMAN_BASE_ORIGIN: "https://forman.example.test", FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_TRUST_PROXY: "true", FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars", FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
});

describe("handleBrowserSubmission", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test.each([1, 2, 10])("checks %i traps and CAPTCHA without false success", async count => {
    const database = createTestDatabase(); databases.push(database);
    const source = await createUnprotectedSource(database.db, { type: "one-shot", name: "Protection matrix" });
    const names = Array.from({ length: count }, (_, i) => `trap_${i}`);
    mutateSourceConfiguration(database.db, source.id, () => ({ altchaEnabled: true, honeypotEnabled: true, honeypotFieldNames: names }));
    for (const contentType of ["application/json", "application/x-www-form-urlencoded"]) {
      const challenge = await createAltchaChallenge({ sourceId: source.sourceId, secret: environment.altchaSecret, workFactor: 1 });
      const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
      const altcha = Buffer.from(JSON.stringify({ ...challenge, ...solution! })).toString("base64url");
      const good = { answer: "Keep", ...Object.fromEntries(names.map(name => [name, ""])), altcha };
      const send = (body: Record<string, string>) => handleBrowserSubmission({ database: database.db, environment }, source.sourceId, new Request(`https://forman.example.test/api/submit/${source.sourceId}`, { method: "POST", headers: { "content-type": contentType, accept: "text/html" }, body: contentType === "application/json" ? JSON.stringify(body) : new URLSearchParams(body).toString() }));
      const before = database.db.select().from(submissions).all().length;
      for (const body of [{ ...good, altcha: "" }, { ...good, altcha: "invalid" }, { ...good, [names[0]]: "bot" }]) {
        const response = await send(body);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Verification failed" });
      }
      expect(database.db.select().from(submissions).all()).toHaveLength(before);
      expect((await send(good)).status).toBe(303);
      expect((await send(good)).status).toBe(403);
      const rows = database.db.select().from(submissions).all();
      expect(rows).toHaveLength(before + 1);
      expect(JSON.parse(rows.at(-1)!.payloadJson)).toEqual({ answer: "Keep" });
    }
  });

  test("stores a solved URL-encoded submission", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    await updateGlobalSettings(database.db, { altchaMaxNumber: 1 });
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: [], altchaEnabled: true, challengeRateLimitPerMinute: null, honeypotEnabled: true,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: form.name, retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null,
      successUrl: null,
    });
    const challenge = await createAltchaChallenge({ sourceId: form.sourceId, secret: environment.altchaSecret, workFactor: 1 });
    const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
    const altcha = Buffer.from(JSON.stringify({ ...challenge, ...solution! })).toString("base64url");
    const body = new URLSearchParams([["email", "a@example.test"], [form.honeypotFieldNames[0], ""], ["altcha", altcha]]);

    const response = await handleBrowserSubmission({ database: database.db, environment }, form.sourceId.toLowerCase(), new Request("https://forman.example.test", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 1 });
  });

  test("stores a browser submission without ALTCHA or honeypot when both protections are disabled", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    const body = new URLSearchParams([["email", "a@example.test"]]);

    const response = await handleBrowserSubmission(
      { database: database.db, environment },
      form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    );

    expect(response.status).toBe(202);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 1 });
    expect(await database.db.select().from(pipelineRuns).all()).toHaveLength(0);
    expect(await database.db.select().from(pipelineActionRuns).all()).toHaveLength(0);
  });

  test("snapshots one configured Pipeline without executing its Actions", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date();
    await database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Verify email", sourceId: form.id, updatedAt: now });
    await database.db.insert(pipelineActions).values([
      { blocking: true, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 3, name: "Verify email", position: 1, type: "webhook", updatedAt: now },
      { blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-2", maximumAttempts: 3, name: "Archive", position: 2, type: "inbox", updatedAt: now },
    ]);

    const response = await handleBrowserSubmission(
      { database: database.db, environment }, form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams([["email", "person@example.test"]]),
      }),
    );

    expect(response.status).toBe(202);
    expect(await database.db.select().from(pipelineRuns).all()).toHaveLength(1);
    expect(await database.db.select().from(pipelineActionRuns).all()).toMatchObject([
      { name: "Verify email", status: "pending" },
      { name: "Archive", status: "not_run" },
    ]);
  });

  test("stores a solved JSON submission with scalar and array values", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    await updateGlobalSettings(database.db, { altchaMaxNumber: 1 });
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: [], altchaEnabled: true, challengeRateLimitPerMinute: null, honeypotEnabled: true,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: form.name, retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null,
      successUrl: null,
    });
    const challenge = await createAltchaChallenge({ sourceId: form.sourceId, secret: environment.altchaSecret, workFactor: 1 });
    const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
    const altcha = Buffer.from(JSON.stringify({ ...challenge, ...solution! })).toString("base64url");

    const response = await handleBrowserSubmission(
      { database: database.db, environment }, form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.test", active: true, priority: 2, topics: ["product", "support"], [form.honeypotFieldNames[0]]: "", altcha }),
      }),
    );

    expect(response.status).toBe(202);
    expect(database.client.prepare("select payload_json from submission").get()).toEqual({ payload_json: '{"email":"a@example.test","active":true,"priority":2,"topics":["product","support"]}' });
  });

  test("stores only the final repeated browser field while applying duplicate-value limits first", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    const repeated = new URLSearchParams([["email", "first@example.test"], ["email", "last@example.test"]]);

    const accepted = await handleBrowserSubmission(
      { database: database.db, environment }, form.sourceId,
      new Request("https://forman.example.test", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: repeated }),
    );

    expect(accepted.status).toBe(202);
    expect(database.client.prepare("select payload_json from submission").get()).toEqual({ payload_json: '{"email":"last@example.test"}' });

    const tooManyValues = new URLSearchParams(Array.from({ length: 21 }, (_, index) => ["email", `${index}`]));
    const rejected = await handleBrowserSubmission(
      { database: database.db, environment }, form.sourceId,
      new Request("https://forman.example.test", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tooManyValues }),
    );

    expect(rejected.status).toBe(400);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 1 });
  });

  test("rejects invalid JSON without storing a submission", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });

    const response = await handleBrowserSubmission(
      { database: database.db, environment }, form.sourceId,
      new Request("https://forman.example.test", { method: "POST", headers: { "content-type": "application/json" }, body: '{"email":' }),
    );

    expect(response.status).toBe(400);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 0 });
  });

  test("rejects multipart payloads instead of treating them as submissions", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });

    const response = await handleBrowserSubmission(
      { database: database.db, environment },
      form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=Forman" },
        body: "--Forman\r\nContent-Disposition: form-data; name=\"email\"\r\n\r\na@example.test\r\n--Forman--",
      }),
    );

    expect(response.status).toBe(415);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 0 });
  });

  test("stores optional browser metadata only when the form enables it", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    await updateGlobalSettings(database.db, { altchaMaxNumber: 1 });
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    mutateSourceConfiguration(database.db, form.id, () => ({ storeUserAgent: true, storeReferer: true }));
    const challenge = await createAltchaChallenge({ sourceId: form.sourceId, secret: environment.altchaSecret, workFactor: 1 });
    const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
    const body = new URLSearchParams([["email", "a@example.test"], [form.honeypotFieldNames[0], ""], ["altcha", Buffer.from(JSON.stringify({ ...challenge, ...solution! })).toString("base64url")]]);

    await handleBrowserSubmission({ database: database.db, environment }, form.sourceId, new Request("https://forman.example.test", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", referer: "https://www.example.test/contact", "user-agent": "Forman test browser" }, body }));

    expect(database.client.prepare("select user_agent, referer from submission").get()).toEqual({ user_agent: "Forman test browser", referer: "https://www.example.test/contact" });
  });

  test("accepts a Page return marker only when the Page belongs to the submitted Source", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const firstForm = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    const secondForm = await createUnprotectedSource(database.db, { type: "one-shot", name: "Survey" });
    const fieldDefinition = '{"type":"object","properties":{"email":{"type":"string","maxLength":254}},"required":["email"],"additionalProperties":false}';
    for (const id of [firstForm.id, secondForm.id]) mutateSourceConfiguration(database.db, id, () => ({ fieldDefinitionMode: "json-schema", fieldDefinitionSource: fieldDefinition }));
    const firstPage = await createPage(database.db, { sourceId: firstForm.id, name: "Contact Prague" }, () => "abcdefgh02");
    const secondPage = await createPage(database.db, { sourceId: secondForm.id, name: "Survey Prague" }, () => "abcdefgh03");
    if (typeof firstPage === "string" || typeof secondPage === "string") throw new Error("Page setup failed");

    const accepted = await handleBrowserSubmission(
      { database: database.db, environment },
      firstForm.sourceId,
      new Request(`https://forman.example.test/api/submit/${firstForm.sourceId}?page=${firstPage.pageId}`, {
        method: "POST",
        headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams([["email", "a@example.test"]]),
      }),
    );
    const rejected = await handleBrowserSubmission(
      { database: database.db, environment },
      firstForm.sourceId,
      new Request(`https://forman.example.test/api/submit/${firstForm.sourceId}?page=${secondPage.pageId}`, {
        method: "POST",
        headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams([["email", "b@example.test"]]),
      }),
    );

    expect(new URL(accepted.headers.get("location")!).searchParams.get("return")).toBe(`page:${firstPage.pageId}`);
    expect(new URL(rejected.headers.get("location")!).searchParams.get("return")).toBeNull();
  });
});
