import { afterEach, describe, expect, test } from "vitest";

import { GET as getChallenge } from "@/app/api/challenge/[sourceId]/route";
import { loadEnvironment } from "@/server/config/environment";
import { getChallengeResponse } from "@/server/sources/challenge-handler";
import { createSource } from "@/server/sources/source-service";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

const environment = loadEnvironment({
  FORMAN_BASE_ORIGIN: "https://forman.example.test",
  FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_TRUST_PROXY: "true",
  FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
  NODE_ENV: "test",
  FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
});

describe("getChallengeResponse", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  const runtimeGlobal = globalThis as typeof globalThis & {
    formanDatabase?: ReturnType<typeof createTestDatabase>;
  };
  afterEach(() => {
    runtimeGlobal.formanDatabase = undefined;
    databases.splice(0).forEach((database) => database.dispose());
  });

  test("returns a challenge only for an active Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { name: "Contact", type: "one-shot" });

    const response = await getChallengeResponse({ database: database.db, environment }, source.sourceId.toLowerCase());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      algorithm: "SHA-256",
      salt: expect.stringContaining(`sourceId=${source.sourceId}`),
    });
  });

  test("authorizes and exposes an ALTCHA challenge to the configured base origin", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runtimeGlobal.formanDatabase = database;
    runMigrations(database.db);
    const source = await createSource(database.db, { name: "Protected contact", type: "one-shot" });
    await updateSourceConfiguration(database.db, source.id, {
      allowedOrigins: ["https://customer.example.test"],
      altchaEnabled: true,
      challengeRateLimitPerMinute: null,
      fieldDefinitionMode: null,
      fieldDefinitionSource: null,
      honeypotEnabled: false,
      honeypotFieldNames: source.honeypotFieldNames,
      maxBodyBytes: 65_536,
      maxEntries: 50,
      maxKeyLength: 100,
      maxUniqueKeys: 30,
      maxValueLength: 10_000,
      maxValuesPerKey: 20,
      name: source.name,
      retentionDays: null,
      storeReferer: false,
      storeUserAgent: false,
      submissionRateLimitPerMinute: null,
      successUrl: null,
    });

    const previousBaseOrigin = process.env.FORMAN_BASE_ORIGIN;
    process.env.FORMAN_BASE_ORIGIN = environment.baseOrigin.toString();
    try {
      const response = await getChallenge(
        new Request(`https://forman.example.test/api/challenge/${source.sourceId}`, {
          headers: {
            origin: environment.baseOrigin.origin,
            "x-forwarded-for": "203.0.113.20",
          },
        }),
        { params: Promise.resolve({ sourceId: source.sourceId }) },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(environment.baseOrigin.origin);
      expect(response.headers.get("vary")).toBe("Origin");
      await expect(response.json()).resolves.toMatchObject({
        algorithm: "SHA-256",
        salt: expect.stringContaining(`sourceId=${source.sourceId}`),
      });
    } finally {
      if (previousBaseOrigin === undefined) delete process.env.FORMAN_BASE_ORIGIN;
      else process.env.FORMAN_BASE_ORIGIN = previousBaseOrigin;
    }
  });

  test("keeps a Source-wide challenge limit for direct deployments without a trusted client address", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runtimeGlobal.formanDatabase = database;
    runMigrations(database.db);
    const source = await createSource(database.db, { name: "Direct contact", type: "one-shot" });
    await updateSourceConfiguration(database.db, source.id, {
      allowedOrigins: [], altchaEnabled: true, challengeRateLimitPerMinute: 1,
      fieldDefinitionMode: null, fieldDefinitionSource: null,
      honeypotEnabled: false, honeypotFieldNames: source.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: source.name,
      retentionDays: null, storeReferer: false, storeUserAgent: false,
      submissionRateLimitPerMinute: null, successUrl: null,
    });
    const previous = { ...process.env };
    Object.assign(process.env, {
      FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
      FORMAN_BASE_ORIGIN: "https://forman.example.test",
      FORMAN_DATABASE_PATH: "/data/forman.sqlite",
      FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
      FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
      NODE_ENV: "test",
    });

    try {
      const request = () => getChallenge(
        new Request(`https://forman.example.test/api/challenge/${source.sourceId}`),
        { params: Promise.resolve({ sourceId: source.sourceId }) },
      );

      expect((await request()).status).toBe(200);
      expect((await request()).status).toBe(429);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) delete process.env[key];
      }
      Object.assign(process.env, previous);
    }
  });
});
