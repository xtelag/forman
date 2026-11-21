import { createHash } from "node:crypto";

import { afterEach, describe, expect, test } from "vitest";

import { loadEnvironment } from "@/server/config/environment";
import { verifyPassword } from "@/server/auth/passwords";
import { createSession, getSession } from "@/server/auth/sessions";
import { createStartupBootstrap } from "@/server/startup/bootstrap";
import { FORMAN_BANNER } from "@/server/startup/banner";
import { pipelines, pipelineActions } from "@/server/db/schema";
import { createUnmigratedTestDatabase } from "../../../helpers/database";

const validEnvironment = loadEnvironment({
  FORMAN_BASE_ORIGIN: "https://forman.example.test",
  FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_TRUST_PROXY: "true",
  FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
  NODE_ENV: "test",
  FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
});

describe("startup bootstrap", () => {
  const databases: ReturnType<typeof createUnmigratedTestDatabase>[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.dispose();
    }
  });

  test.each(["https://forman.example.test", "http://forman.localhost:5173"])("reports database readiness and base origin %s once during startup", async (origin) => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);
    const output: string[] = [];
    const cleanupJobs: Array<() => Promise<void>> = [];
    const pipelineJobs: Array<() => Promise<void>> = [];
    const bootstrap = createStartupBootstrap({
      database: database.db,
      environment: { ...validEnvironment, baseOrigin: new URL(origin) },
      write: (value) => output.push(value),
      scheduleCleanup: (job) => cleanupJobs.push(job),
      schedulePipelineWorker: (job) => pipelineJobs.push(job),
    });

    await bootstrap.start();
    await bootstrap.start();

    const migrationCount = database.client
      .prepare("select count(*) as count from __drizzle_migrations")
      .get() as { count: number };

    expect(migrationCount.count).toBe(1);
    expect(output).toEqual([
      FORMAN_BANNER,
      "→ Checking database migrations",
      "✓ New database initialized",
      `→ Base origin: ${origin}`,
    ]);
    expect(cleanupJobs).toHaveLength(1);
    expect(pipelineJobs).toHaveLength(1);
    expect(
      database.client
        .prepare("select username, is_initial_password from administrator")
        .all(),
    ).toEqual([{ username: "forman", is_initial_password: 1 }]);
  });

  test("rejects the development password at production startup", async () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);
    const environment = loadEnvironment({
      FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
      FORMAN_BASE_ORIGIN: "https://forman.example.test",
      FORMAN_DATABASE_PATH: "/data/forman.sqlite",
      FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
      FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
      NODE_ENV: "production",
    });

    await expect(createStartupBootstrap({
      database: database.db,
      environment,
      write: () => undefined,
    }).start()).rejects.toThrow(/FORMAN_INITIAL_ADMIN_PASSWORD/);
  });

  test("applies an emergency password reset only once per reset value", async () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);
    await createStartupBootstrap({
      database: database.db,
      environment: validEnvironment,
      write: () => undefined,
    }).start();
    const resetEnvironment = loadEnvironment({
      FORMAN_BASE_ORIGIN: "https://forman.example.test",
      FORMAN_DATABASE_PATH: "/data/forman.sqlite",
      FORMAN_TRUST_PROXY: "true",
      FORMAN_SESSION_SECRET:
        "a-session-secret-that-is-at-least-thirty-two-chars",
      FORMAN_ALTCHA_SECRET:
        "an-altcha-secret-that-is-at-least-thirty-two-chars",
      NODE_ENV: "test",
      FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
      FORMAN_ADMIN_PASSWORD_RESET: "emergency-password-that-is-long-enough",
    });
    const sessionBeforeReset = await createSession(database.db);

    await createStartupBootstrap({
      database: database.db,
      environment: resetEnvironment,
      write: () => undefined,
    }).start();
    const record = database.client
      .prepare(
        "select password_hash, is_initial_password from administrator where id = 'admin'",
      )
      .get() as { password_hash: string; is_initial_password: number };
    await expect(
      verifyPassword(
        "emergency-password-that-is-long-enough",
        record.password_hash,
      ),
    ).resolves.toBe(true);
    expect(record.is_initial_password).toBe(0);
    const fingerprint = database.client
      .prepare("select admin_password_reset_fingerprint as fingerprint from global_setting where id = 'global'")
      .get() as { fingerprint: string };
    expect(fingerprint.fingerprint).toMatch(/^hmac-sha256:v1:/);
    expect(fingerprint.fingerprint).not.toBe(
      createHash("sha256")
        .update("emergency-password-that-is-long-enough")
        .digest("base64url"),
    );
    await expect(getSession(database.db, sessionBeforeReset)).resolves.toBeNull();

    const sessionAfterReset = await createSession(database.db);
    await createStartupBootstrap({
      database: database.db,
      environment: resetEnvironment,
      write: () => undefined,
    }).start();
    await expect(getSession(database.db, sessionAfterReset)).resolves.not.toBeNull();

    const legacyFingerprint = createHash("sha256")
      .update("emergency-password-that-is-long-enough")
      .digest("base64url");
    database.client
      .prepare("update global_setting set admin_password_reset_fingerprint = ? where id = 'global'")
      .run(legacyFingerprint);
    const legacySession = await createSession(database.db);
    await createStartupBootstrap({
      database: database.db,
      environment: resetEnvironment,
      write: () => undefined,
    }).start();
    await expect(getSession(database.db, legacySession)).resolves.toBeNull();
    expect((database.client
      .prepare("select admin_password_reset_fingerprint as fingerprint from global_setting where id = 'global'")
      .get() as { fingerprint: string }).fingerprint).toMatch(/^hmac-sha256:v1:/);
  });

  test("starts when existing webhook Actions use stored credentials", async () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);
    await createStartupBootstrap({
      database: database.db,
      environment: validEnvironment,
      write: () => undefined,
    }).start();
    const now = new Date();
    const form = await (
      await import("@/server/sources/source-service")
    ).createSource(database.db, { type: "one-shot", name: "Contact" });
    await database.db
      .insert(pipelines)
      .values({
        id: "pipeline",
        name: "CRM sync",
        sourceId: form.id,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    await database.db.insert(pipelineActions).values({
      blocking: true,
      conditionMissBehavior: "skip_action",
      configurationJson: '{"url":"https://crm.example.test/hook","bearerToken":"stored-secret"}',
      createdAt: now,
      pipelineId: "pipeline",
      enabled: true,
      id: "action",
      maximumAttempts: 3,
      name: "CRM",
      position: 1,
      type: "webhook",
      updatedAt: now,
    });
    await expect(
      createStartupBootstrap({
        database: database.db,
        environment: validEnvironment,
        write: () => undefined,
      }).start(),
    ).resolves.toBeUndefined();
  });
});
