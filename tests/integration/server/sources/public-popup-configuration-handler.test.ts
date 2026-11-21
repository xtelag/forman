import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { afterEach, describe, expect, test } from "vitest";

import { GET } from "@/app/api/submit/[sourceId]/route";
import { createSource } from "@/server/sources/source-service";
import {
  setSourceEnabled,
  updateSourceConfiguration,
} from "@/server/sources/lifecycle-service";
import { getPublicPopupConfiguration } from "@/server/sources/public-popup-configuration-handler";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("getPublicPopupConfiguration", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  const runtimeGlobal = globalThis as typeof globalThis & {
    formanDatabase?: ReturnType<typeof createTestDatabase>;
  };
  afterEach(() => {
    runtimeGlobal.formanDatabase = undefined;
    databases.splice(0).forEach((database) => database.dispose());
  });

  test("returns exactly the enabled browser protections for an authorized active Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: ["https://widget.example.test"],
      altchaEnabled: true,
      challengeRateLimitPerMinute: 10,
      honeypotEnabled: false,
      maxBodyBytes: 65_536,
      maxEntries: 50,
      maxKeyLength: 100,
      maxUniqueKeys: 30,
      maxValueLength: 10_000,
      maxValuesPerKey: 20,
      name: form.name,
      retentionDays: 30,
      storeReferer: true,
      storeUserAgent: true,
      submissionRateLimitPerMinute: 5,
      successUrl: "https://example.test/thanks",
    });

    const response = await getPublicPopupConfiguration(
      { database: database.db },
      form.sourceId.toUpperCase(),
      "https://widget.example.test",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      altchaEnabled: true,
      honeypotEnabled: false,
      honeypotFieldNames: form.honeypotFieldNames,
    });
  });

  test("returns the generic unavailable response for a missing or inactive Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    await setSourceEnabled(database.db, form.id, false);

    const inactive = await getPublicPopupConfiguration(
      { database: database.db },
      form.sourceId,
      null,
    );
    const missing = await getPublicPopupConfiguration(
      { database: database.db },
      "does-not-exist",
      null,
    );

    expect(inactive.status).toBe(503);
    await expect(inactive.json()).resolves.toEqual({
      error: "Source unavailable",
    });
    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toEqual({
      error: "Source unavailable",
    });
  });

  test("rejects a browser request from a disallowed explicit origin", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    mutateSourceConfiguration(database.db, form.id, () => ({ allowedOrigins: ["https://widget.example.test"] }));

    const response = await getPublicPopupConfiguration(
      { database: database.db },
      form.sourceId,
      "https://untrusted.example.test",
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("vary")).toBe("Origin");
  });

  test("accepts a browser request with an Origin when the Source allows all origins", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });

    const response = await getPublicPopupConfiguration(
      { database: database.db },
      form.sourceId,
      "https://widget.example.test",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      altchaEnabled: true,
      honeypotEnabled: false,
      honeypotFieldNames: form.honeypotFieldNames,
    });
  });
});

describe("GET /api/submit/[sourceId]", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  const runtimeGlobal = globalThis as typeof globalThis & {
    formanDatabase?: ReturnType<typeof createTestDatabase>;
  };
  afterEach(() => {
    runtimeGlobal.formanDatabase = undefined;
    databases.splice(0).forEach((database) => database.dispose());
  });

  test("returns CORS headers for an allowed explicit browser origin", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runtimeGlobal.formanDatabase = database;
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    mutateSourceConfiguration(database.db, form.id, () => ({ allowedOrigins: ["https://widget.example.test"] }));

    const response = await GET(
      new Request("https://forman.example.test/api/submit/contact", {
        headers: { origin: "https://widget.example.test" },
      }),
      { params: Promise.resolve({ sourceId: form.sourceId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://widget.example.test",
    );
    expect(response.headers.get("vary")).toBe("Origin");
  });

});
