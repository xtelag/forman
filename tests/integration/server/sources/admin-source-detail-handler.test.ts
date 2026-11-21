import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";

import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { pages, sources, submissions, serverSubmissionTokens } from "@/server/db/schema";
import { createAdminSourceDetailHandler } from "@/server/sources/admin-source-detail-handler";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

const isoTimestamp = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
);

describe("admin Source detail handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() =>
    databases.splice(0).forEach((database) => database.dispose()),
  );

  test("returns the complete Source detail DTO without the former form alias", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { name: "Contact", type: "one-shot" });
    await database.db.insert(submissions).values({
      createdAt: new Date("2026-08-13T10:00:00.000Z"),
      sourceId: source.id,
      id: "submission",
      payloadJson: '{"email":["person@example.test"],"message":["Hello"]}',
    });
    database.db.insert(pages).values({
      id: "related-page", pageId: "related-page", name: "Contact page", sourceId: source.id,
      createdAt: new Date(), updatedAt: new Date(),
    }).run();
    const token = await createSession(database.db);

    const response = await createAdminSourceDetailHandler({
      baseUrl: new URL("https://forman.test"),
      database: database.db,
    }).get(
      new Request(`https://forman.test/api/admin/v1/sources/${source.sourceId}`, {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
      source.sourceId,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toStrictEqual({
      pipelines: [],
      pageCount: 1,
      source: {
        type: "one-shot",
        allowedOrigins: [],
        altchaEnabled: true,
        challengeRateLimitPerMinute: null,
        createdAt: isoTimestamp,
        enabled: true,
        fieldDefinitionMode: null,
        fieldDefinitionSource: null,
        sourceId: source.sourceId,
        honeypotEnabled: false,
        honeypotFieldNames: [expect.stringMatching(/^[a-z][a-z0-9_]{2,63}$/)],
        id: source.id,
        maxBodyBytes: 65_536,
        maxEntries: 50,
        maxKeyLength: 100,
        maxUniqueKeys: 30,
        maxValueLength: 10_000,
        maxValuesPerKey: 20,
        name: "Contact",
        retentionDays: null,
        serverTokenPrefix: null,
        storeReferer: false,
        storeUserAgent: false,
        submissionRateLimitPerMinute: null,
        successUrl: null,
        tags: [],
        updatedAt: isoTimestamp,
      },
      observedFieldNames: ["email", "message"],
      submissionCount: 1,
      sessionSettings: {enabled:false,inactivityDays:30,completedRetentionDays:30},
      integration: {
        examplesAvailable: false,
        endpoints: {submission: `https://forman.test/api/submit/${source.sourceId}`, challenge: `https://forman.test/api/challenge/${source.sourceId}`},
        sourceType:"one-shot", sessionJavaScript:null, sessionReactJsx:null, warnings:[],
        browserHtml: "", browserJavaScript: "", reactJsx: "", m2mCurl: "", popupSource: "",
      },
    });
    expect(body).not.toHaveProperty("form");
  });

  test.each(["one-shot", "session", "m2m"] as const)("exposes only %s integrations and its appropriate token", async (type) => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, {name: "Typed Source", type});
    await mutateSourceConfiguration(database.db, source.id, () => ({fieldDefinitionMode:"json-schema", fieldDefinitionSource:JSON.stringify({type:"object",properties:{email:{type:"string",format:"email"}},additionalProperties:false})}));
    const token = await createSession(database.db);
    const response = await createAdminSourceDetailHandler({baseUrl:new URL("https://forman.test"),database:database.db}).get(new Request("https://forman.test",{headers:{cookie:`__Host-forman_session=${token}`}}),source.sourceId);
    const {integration,source:detail} = await response.json();
    expect(integration.sourceType).toBe(type);
    expect(integration.endpoints).toEqual({submission:`https://forman.test/api/submit/${source.sourceId}`,challenge:type === "m2m" ? null : `https://forman.test/api/challenge/${source.sourceId}`});
    expect(Boolean(integration.browserJavaScript)).toBe(type === "one-shot");
    expect(Boolean(integration.browserHtml)).toBe(type === "one-shot");
    expect(Boolean(integration.popupSource)).toBe(type === "one-shot");
    expect(Boolean(integration.sessionJavaScript)).toBe(type === "session");
    expect(Boolean(integration.sessionReactJsx)).toBe(type === "session");
    expect(Boolean(integration.m2mCurl)).toBe(type === "m2m");
    const records = await database.db.select().from(serverSubmissionTokens).where(eq(serverSubmissionTokens.sourceId,source.id));
    expect(records).toHaveLength(type === "m2m" ? 1 : 0);
    if(type !== "m2m") expect(detail.serverTokenPrefix).toBeNull();
    for(const snippet of [integration.browserJavaScript,integration.sessionJavaScript,integration.m2mCurl].filter(Boolean)) expect(snippet).toContain(integration.endpoints.submission);
    expect(JSON.stringify(integration)).not.toMatch(/\/api\/(sessions|m2m)\//);
  });

  test("rejects unauthenticated Source reads and returns not found for an unknown Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const handler = createAdminSourceDetailHandler({
      baseUrl: new URL("https://forman.test"),
      database: database.db,
    });

    expect(
      (
        await handler.get(
          new Request("https://forman.test/api/admin/v1/sources/missing"),
          "missing",
        )
      ).status,
    ).toBe(401);

    const token = await createSession(database.db);
    expect(
      (
        await handler.get(
          new Request("https://forman.test/api/admin/v1/sources/missing", {
            headers: { cookie: `__Host-forman_session=${token}` },
          }),
          "missing",
        )
      ).status,
    ).toBe(404);
  });

  test("provisions a token before returning a pre-existing Source detail", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    await database.db.insert(sources).values({
      createdAt: new Date("2026-08-13T10:00:00.000Z"),
      sourceId: "pre-existing",
      id: "pre-existing-source",
      name: "Pre-existing source",
      type: "m2m",
      updatedAt: new Date("2026-08-13T10:00:00.000Z"),
    });
    const token = await createSession(database.db);

    const response = await createAdminSourceDetailHandler({
      baseUrl: new URL("https://forman.test"),
      database: database.db,
    }).get(new Request("https://forman.test/api/admin/v1/sources/pre-existing", {
      headers: { cookie: `__Host-forman_session=${token}` },
    }), "pre-existing");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: { serverTokenPrefix: expect.stringMatching(/^[A-Za-z0-9_-]{3}$/) },
    });
  });

});
