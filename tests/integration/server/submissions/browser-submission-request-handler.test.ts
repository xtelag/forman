import { afterEach, describe, expect, test } from "vitest";

import { OPTIONS as submitOptions } from "@/app/api/submit/[sourceId]/route";
import { loadEnvironment } from "@/server/config/environment";
import { updateGlobalSettings } from "@/server/config/global-settings";
import { runMigrations } from "@/server/db/migrate";
import { createUnprotectedSource } from "../../../helpers/unprotected-source";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { createPage, findPageByPublicId, updatePage } from "@/server/pages/page-service";
import { handleBrowserSubmissionRequest } from "@/server/submissions/browser-submission-request-handler";
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

describe("browser submission request handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  const runtimeGlobal = globalThis as typeof globalThis & {
    formanDatabase?: ReturnType<typeof createTestDatabase>;
  };
  afterEach(() => {
    runtimeGlobal.formanDatabase = undefined;
    (globalThis as typeof globalThis & { formanRateLimiters?: Map<number, unknown> }).formanRateLimiters = undefined;
    databases.splice(0).forEach((database) => database.dispose());
  });

  test("accepts a native Page submission from the configured base origin with a restrictive external allowlist", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createUnprotectedSource(database.db, { type: "one-shot", name: "Consent" });
    await updateSourceConfiguration(database.db, source.id, {
      allowedOrigins: ["https://customer.example.test"], altchaEnabled: false, challengeRateLimitPerMinute: null,
      fieldDefinitionMode: "json-schema",
      fieldDefinitionSource: '{"type":"object","properties":{"subscribed":{"type":"boolean"}},"required":["subscribed"],"additionalProperties":false}',
      honeypotEnabled: false, honeypotFieldNames: source.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: "Consent", retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
    });
    await createPage(database.db, { sourceId: source.id, name: "Consent Page" }, () => "abcdefgh02");
    const updatedPage = await updatePage(database.db, "abcdefgh02", {
      enabled: true, name: "Consent Page", presentation: null,
    });
    expect(updatedPage).toMatchObject({ enabled: true, sourceId: source.id, pageId: "abcdefgh02" });
    expect(await findPageByPublicId(database.db, "abcdefgh02")).toMatchObject({
      sourceId: source.id,
      pageId: "abcdefgh02",
    });

    const response = await handleBrowserSubmissionRequest(
      { database: database.db, environment },
      source.sourceId,
      new Request(`https://forman.example.test/api/submit/${source.sourceId}?page=abcdefgh02`, {
        body: new URLSearchParams([["subscribed", "true"]]),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: environment.baseOrigin.origin,
          "x-forwarded-for": "203.0.113.10",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("access-control-allow-origin")).toBe(environment.baseOrigin.origin);
    expect(new URL(response.headers.get("location")!).searchParams.get("return")).toBe("page:abcdefgh02");
    expect(database.client.prepare("select payload_json from submission").get()).toEqual({ payload_json: '{"subscribed":true}' });
  });

  test("HTML arrays retain types and cannot bypass decoded value limits", async () => {
    const database=createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source=await createUnprotectedSource(database.db,{type:"one-shot",name:"Array regression"});
    await updateSourceConfiguration(database.db,source.id,{
      allowedOrigins:[],altchaEnabled:false,challengeRateLimitPerMinute:null,
      fieldDefinitionMode:"json-schema",fieldDefinitionSource:JSON.stringify({type:"object",properties:{topics:{type:"array",items:{type:"string"}},rating:{type:"integer",minimum:1},consent:{type:"boolean"}},additionalProperties:false}),
      honeypotEnabled:false,honeypotFieldNames:source.honeypotFieldNames,maxBodyBytes:65536,maxEntries:50,maxKeyLength:100,maxUniqueKeys:30,maxValueLength:10000,maxValuesPerKey:2,name:"Array regression",retentionDays:null,storeReferer:false,storeUserAgent:false,submissionRateLimitPerMinute:null,successUrl:null,
    });
    const send=(topics:string)=>handleBrowserSubmissionRequest({database:database.db,environment},source.sourceId,new Request(`https://forman.example.test/api/submit/${source.sourceId}`,{method:"POST",headers:{accept:"application/json","content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({topics,rating:"",consent:"false"})}));
    expect((await send('["forms","surveys"]')).status).toBe(202);
    expect(JSON.parse((database.client.prepare("SELECT payload_json FROM submission").get() as {payload_json:string}).payload_json)).toEqual({topics:["forms","surveys"],consent:false});
    expect((await send('["a","b","c"]')).status).toBe(400);
    expect(database.client.prepare("SELECT count(*) AS count FROM submission").get()).toEqual({count:1});
  });

  test("allows submission preflight from the configured base origin with a restrictive external allowlist", async () => {
    const database = createTestDatabase(); databases.push(database); runtimeGlobal.formanDatabase = database; runMigrations(database.db);
    const source = await createUnprotectedSource(database.db, { type: "one-shot", name: "Consent" });
    await updateSourceConfiguration(database.db, source.id, {
      allowedOrigins: ["https://customer.example.test"], altchaEnabled: false, challengeRateLimitPerMinute: null,
      fieldDefinitionMode: null, fieldDefinitionSource: null,
      honeypotEnabled: false, honeypotFieldNames: source.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: "Consent", retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
    });

    const previousBaseOrigin = process.env.FORMAN_BASE_ORIGIN;
    process.env.FORMAN_BASE_ORIGIN = environment.baseOrigin.toString();
    try {
      const response = await submitOptions(
        new Request(`https://forman.example.test/api/submit/${source.sourceId}`, {
          headers: { origin: environment.baseOrigin.origin },
          method: "OPTIONS",
        }),
        { params: Promise.resolve({ sourceId: source.sourceId }) },
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(environment.baseOrigin.origin);
      expect(response.headers.get("vary")).toBe("Origin");
    } finally {
      if (previousBaseOrigin === undefined) delete process.env.FORMAN_BASE_ORIGIN;
      else process.env.FORMAN_BASE_ORIGIN = previousBaseOrigin;
    }
  });

  test("rejects an oversized declared body without consuming it", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createUnprotectedSource(database.db, { type: "one-shot", name: "Consent" });
    const request = new Request(`https://forman.example.test/api/submit/${source.sourceId}`, {
      body: new URLSearchParams([["email", "john@example.test"]]),
      headers: {
        "content-length": "65537",
        "content-type": "application/x-www-form-urlencoded",
        origin: environment.baseOrigin.origin,
        "x-forwarded-for": "203.0.113.11",
      },
      method: "POST",
    });

    const response = await handleBrowserSubmissionRequest(
      { database: database.db, environment },
      source.sourceId,
      request,
    );

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 0 });
  });

  test("shares the Source-wide limit across different client addresses", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createUnprotectedSource(database.db, { type: "one-shot", name: "Shared budget" });
    await updateGlobalSettings(database.db, {
      clientBurstLimit: 100,
      clientRateLimitPerMinute: 100,
      sourceRateLimitPerMinute: 2,
      submissionRateLimitPerMinute: 100,
    });
    const submitFrom = (address: string) => handleBrowserSubmissionRequest(
      { database: database.db, environment },
      source.sourceId,
      new Request(`https://forman.example.test/api/submit/${source.sourceId}`, {
        body: new URLSearchParams([["email", "john@example.test"]]),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          origin: environment.baseOrigin.origin,
          "x-forwarded-for": address,
        },
        method: "POST",
      }),
    );

    expect((await submitFrom("203.0.113.21")).status).toBe(202);
    expect((await submitFrom("203.0.113.22")).status).toBe(202);
    expect((await submitFrom("203.0.113.23")).status).toBe(429);
  });
});
