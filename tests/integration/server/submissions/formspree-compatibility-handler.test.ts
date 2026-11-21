import { afterEach, describe, expect, test } from "vitest";

import { loadEnvironment } from "@/server/config/environment";
import { updateGlobalSettings } from "@/server/config/global-settings";
import { runMigrations } from "@/server/db/migrate";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { createUnprotectedSource } from "../../../helpers/unprotected-source";
import {
  handleFormspreeCompatibilityPreflight,
  handleFormspreeCompatibilitySubmission,
} from "@/server/submissions/formspree-compatibility-handler";
import { createTestDatabase } from "../../../helpers/database";

const environment = loadEnvironment({
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
  FORMAN_BASE_ORIGIN: "https://forman.example.test",
  FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  NODE_ENV: "test",
  FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
  FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_TRUST_PROXY: "true",
});

describe("Formspree-compatible submissions", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("accepts a browser submission after the compatibility endpoint is enabled", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    await updateGlobalSettings(database.db, {
      formspreeCompatibilityEndpointEnabled: true,
    });

    const response = await handleFormspreeCompatibilitySubmission(
      { database: database.db, environment },
      form.sourceId,
      new Request(`https://forman.example.test/f/${form.sourceId}`, {
        body: new URLSearchParams([["email", "person@example.test"]]),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.10",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 1 });
  });

  test("does not expose the compatibility endpoint by default", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    const response = await handleFormspreeCompatibilitySubmission(
      { database: database.db, environment },
      form.sourceId,
      new Request(`https://forman.example.test/f/${form.sourceId}`, {
        body: new URLSearchParams([["email", "person@example.test"]]),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.10",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 0 });
  });

  test("passes the configured base origin policy through compatibility preflight", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createUnprotectedSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, source.id, {
      allowedOrigins: ["https://customer.example.test"],
      altchaEnabled: false,
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
    await updateGlobalSettings(database.db, {
      formspreeCompatibilityEndpointEnabled: true,
    });

    const response = await handleFormspreeCompatibilityPreflight(
      { database: database.db, environment },
      source.sourceId,
      new Request(`https://forman.example.test/f/${source.sourceId}`, {
        headers: { origin: environment.baseOrigin.origin },
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(environment.baseOrigin.origin);
  });
});
