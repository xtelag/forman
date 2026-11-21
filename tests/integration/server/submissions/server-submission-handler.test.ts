import { afterEach, describe, expect, test, vi } from "vitest";

import { POST as postServerSubmission } from "@/app/api/submit/[sourceId]/route";
import { updateGlobalSettings } from "@/server/config/global-settings";
import { issueServerSubmissionToken } from "@/server/sources/server-token-service";
import { createSource } from "@/server/sources/source-service";
import { pipelineRuns, pipelineActionRuns, pipelines, pipelineActions } from "@/server/db/schema";
import { handleServerSubmission } from "@/server/submissions/server-submission-handler";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("handleServerSubmission", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  const runtimeGlobal = globalThis as typeof globalThis & {
    formanDatabase?: ReturnType<typeof createTestDatabase>;
    formanRateLimiters?: Map<number, unknown>;
  };

  afterEach(() => {
    runtimeGlobal.formanDatabase = undefined;
    runtimeGlobal.formanRateLimiters = undefined;
    databases.splice(0).forEach((database) => database.dispose());
  });

  test("accepts an authenticated flat JSON payload without ALTCHA", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "m2m", name: "Trusted intake" });
    const { token } = await issueServerSubmissionToken(database.db, form.id);

    const response = await handleServerSubmission(
      database.db,
      form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source: "crm",
          email: ["a@example.test", ""],
          accepted: true,
          attempt: 2,
        }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      submissionId: expect.any(String),
    });
    expect(
      database.client.prepare("select payload_json from submission").get(),
    ).toEqual({
      payload_json:
        '{"source":"crm","email":["a@example.test",""],"accepted":true,"attempt":2}',
    });
  });

  test("starts one configured Pipeline after accepting a server submission", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "m2m", name: "Trusted intake" });
    const { token } = await issueServerSubmissionToken(database.db, form.id);
    const now = new Date();
    await database.db.insert(pipelines).values({
      createdAt: now,
      enabled: true,
      id: "flow-1",
      name: "Verify contact",
      sourceId: form.id,
      updatedAt: now,
    });
    await database.db.insert(pipelineActions).values({
      blocking: true,
      conditionMissBehavior: "skip_action",
      configurationJson: "{}",
      createdAt: now,
      pipelineId: "flow-1",
      enabled: true,
      id: "action-1",
      maximumAttempts: 3,
      name: "Verify email",
      position: 1,
      type: "webhook",
      updatedAt: now,
    });

    await handleServerSubmission(
      database.db,
      form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "john@example.test" }),
      }),
    );
    expect(await database.db.select().from(pipelineRuns).all()).toHaveLength(1);
    expect(await database.db.select().from(pipelineActionRuns).all()).toMatchObject([
      { name: "Verify email", status: "pending" },
    ]);
  });

  test("rejects missing credentials without storage", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "m2m", name: "Trusted intake" });

    const response = await handleServerSubmission(
      database.db,
      form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nested: { no: ["thanks"] } }),
      }),
    );

    expect(response.status).toBe(401);
    expect(
      database.client.prepare("select count(*) as count from submission").get(),
    ).toEqual({ count: 0 });
  });

  test("consumes the Source budget only after successful authentication", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "m2m", name: "Trusted intake" });
    const afterAuthentication = vi.fn(() =>
      Response.json({ error: "Too many requests" }, { status: 429 }));

    const rejected = await handleServerSubmission(
      database.db,
      source.sourceId,
      new Request("https://forman.example.test", {
        body: "{}",
        headers: {
          authorization: "Bearer invalid",
          "content-type": "application/json",
        },
        method: "POST",
      }),
      { afterAuthentication },
    );
    expect(rejected.status).toBe(401);
    expect(afterAuthentication).not.toHaveBeenCalled();

    const { token } = await issueServerSubmissionToken(database.db, source.id);
    const limited = await handleServerSubmission(
      database.db,
      source.sourceId,
      new Request("https://forman.example.test", {
        body: "{}",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
      { afterAuthentication },
    );
    expect(limited.status).toBe(429);
    expect(afterAuthentication).toHaveBeenCalledOnce();
  });

  test("invalid M2M credentials cannot exhaust the authenticated Source budget", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runtimeGlobal.formanDatabase = database;
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "m2m", name: "Trusted intake" });
    const { token } = await issueServerSubmissionToken(database.db, source.id);
    await updateGlobalSettings(database.db, {
      clientBurstLimit: 100,
      clientRateLimitPerMinute: 100,
      sourceRateLimitPerMinute: 1,
      submissionRateLimitPerMinute: 100,
    });
    const previous = { ...process.env };
    Object.assign(process.env, {
      FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
      FORMAN_BASE_ORIGIN: "https://forman.example.test",
      FORMAN_DATABASE_PATH: "/data/forman.sqlite",
      NODE_ENV: "test",
      FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
      FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
      FORMAN_TRUST_PROXY: "true",
    });
    const requestFrom = (authorization: string, address: string) =>
      postServerSubmission(new Request(`https://forman.example.test/api/submit/${source.sourceId}`, {
        body: "{}",
        headers: {
          authorization,
          "content-type": "application/json",
          "x-forwarded-for": address,
        },
        method: "POST",
      }), { params: Promise.resolve({ sourceId: source.sourceId }) });

    try {
      expect((await requestFrom("Bearer invalid", "203.0.113.31")).status).toBe(401);
      expect((await requestFrom(`Bearer ${token}`, "203.0.113.32")).status).toBe(202);
      expect((await requestFrom(`Bearer ${token}`, "203.0.113.33")).status).toBe(429);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) delete process.env[key];
      }
      Object.assign(process.env, previous);
    }
  });

  test("rejects an oversized declared body without consuming it", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "m2m", name: "Trusted intake" });
    const { token } = await issueServerSubmissionToken(database.db, source.id);
    const request = new Request("https://forman.example.test", {
      body: '{"email":"john@example.test"}',
      headers: {
        authorization: `Bearer ${token}`,
        "content-length": "65537",
        "content-type": "application/json",
      },
      method: "POST",
    });

    const response = await handleServerSubmission(
      database.db,
      source.sourceId,
      request,
    );

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(
      database.client.prepare("select count(*) as count from submission").get(),
    ).toEqual({ count: 0 });
  });

  test.each([
    { email: null },
    { email: { nested: "value" } },
    { email: [["nested"]] },
    { email: [] },
  ])(
    "rejects an authenticated invalid payload atomically: %j",
    async (body) => {
      const database = createTestDatabase();
      databases.push(database);
      runMigrations(database.db);
      const form = await createSource(database.db, { type: "m2m", name: "Trusted intake" });
      const { token } = await issueServerSubmissionToken(database.db, form.id);

      const response = await handleServerSubmission(
        database.db,
        form.sourceId,
        new Request("https://forman.example.test", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );

      expect(response.status).toBe(400);
      expect(
        database.client
          .prepare("select count(*) as count from submission")
          .get(),
      ).toEqual({ count: 0 });
    },
  );

  test("keeps only the final value for a repeated JSON object key", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "m2m", name: "Repeated keys" });
    const { token } = await issueServerSubmissionToken(database.db, form.id);

    const response = await handleServerSubmission(
      database.db,
      form.sourceId,
      new Request("https://forman.example.test", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: '{"email":"first@example.test","email":"last@example.test"}',
      }),
    );

    expect(response.status).toBe(202);
    expect(
      database.client.prepare("select payload_json from submission").get(),
    ).toEqual({
      payload_json: '{"email":"last@example.test"}',
    });
  });
});
