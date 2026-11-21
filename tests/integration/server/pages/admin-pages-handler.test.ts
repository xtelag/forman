import { afterEach, describe, expect, test } from "vitest";

import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createSource } from "@/server/sources/source-service";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { createAdminPagesHandler } from "@/server/pages/admin-pages-handler";
import {
  createTag,
  replaceSourceTags,
} from "@/server/tags/tag-service";
import { createTestDatabase } from "../../../helpers/database";

async function configurePageSource(
  database: ReturnType<typeof createTestDatabase>,
  source: Awaited<ReturnType<typeof createSource>>,
) {
  await updateSourceConfiguration(database.db, source.id, {
    allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null,
    fieldDefinitionMode: "json-schema",
    fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","maxLength":254}},"required":["email"],"additionalProperties":false}',
    honeypotEnabled: false, honeypotFieldNames: source.honeypotFieldNames,
    maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
    maxValueLength: 10_000, maxValuesPerKey: 20, name: source.name, retentionDays: null,
    storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
  });
}

function request(path: string, token?: string, init: RequestInit = {}) {
  return new Request(`https://forman.example.test${path}`, {
    ...init,
    headers: {
      ...(token ? { cookie: `__Host-forman_session=${token}` } : {}),
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

describe("admin Pages handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  const baseUrl = new URL("https://forman.example.test");

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("requires an administrator session for Page operations", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const handler = createAdminPagesHandler({
      baseUrl,
      database: database.db,
    });

    expect((await handler.list(request("/api/admin/v1/pages"))).status).toBe(401);
    expect((await handler.create(request("/api/admin/v1/pages", undefined, {
      body: JSON.stringify({ sourceId: "form-1", name: "Contact" }),
      method: "POST",
    }))).status).toBe(401);
    expect((await handler.get(request("/api/admin/v1/pages/missing"), "missing")).status).toBe(401);
  });

  test("enables Page operations using only the base origin", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const handler = createAdminPagesHandler({
      baseUrl,
      database: database.db,
    });

    expect((await handler.list(request("/api/admin/v1/pages", token))).status).toBe(200);
    expect((await handler.get(request("/api/admin/v1/pages/page-a", token), "page-a")).status).toBe(404);
  });

  test("creates and lists Pages for existing Sources", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await configurePageSource(database, form);
    const handler = createAdminPagesHandler({
      baseUrl,
      database: database.db,
    });

    const created = await handler.create(request("/api/admin/v1/pages", token, {
      body: JSON.stringify({ sourceId: form.id, name: "Contact Prague" }),
      method: "POST",
    }));

    expect(created.status).toBe(201);
    const page = await created.json() as { pageId: string };
    expect(page).toMatchObject({
      enabled: false,
      sourceId: form.id,
      sourceName: "Contact",
      name: "Contact Prague",
      pageId: expect.stringMatching(/^[abcdefghjkmnpqrstuvwxyz023456789]{10}$/),
      presentation: { fields: [{ name: "email", order: 0, step: 1 }] },
      publicUrl: expect.stringMatching(/^https:\/\/forman\.example\.test\/pages\//),
    });

    const listed = await handler.list(request("/api/admin/v1/pages", token));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      items: [{ name: "Contact Prague", pageId: page.pageId }],
    });
  });

  test("returns the current Source tags for every linked Page", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const untaggedSource = await createSource(database.db, { type: "one-shot",
      name: "Feedback",
    });
    await configurePageSource(database, source);
    await configurePageSource(database, untaggedSource);
    const sales = await createTag(database.db, {
      color: "blue",
      name: "Sales",
    });
    const support = await createTag(database.db, {
      color: "violet",
      name: "Support",
    });
    await replaceSourceTags(database.db, source.id, [sales.id]);
    const handler = createAdminPagesHandler({
      baseUrl,
      database: database.db,
    });

    const first = await handler.create(
      request("/api/admin/v1/pages", token, {
        body: JSON.stringify({ sourceId: source.id, name: "Prague" }),
        method: "POST",
      }),
    );
    await handler.create(
      request("/api/admin/v1/pages", token, {
        body: JSON.stringify({ sourceId: source.id, name: "Brno" }),
        method: "POST",
      }),
    );
    await handler.create(
      request("/api/admin/v1/pages", token, {
        body: JSON.stringify({
          sourceId: untaggedSource.id,
          name: "Feedback Page",
        }),
        method: "POST",
      }),
    );

    const listed = await handler.list(request("/api/admin/v1/pages", token));
    const listedBody = (await listed.json()) as {
      items: Array<{ name: string; tags: unknown[] }>;
    };
    expect(
      listedBody.items
        .filter((page) => page.name === "Prague" || page.name === "Brno")
        .map((page) => page.tags),
    ).toEqual([[sales], [sales]]);
    expect(
      listedBody.items.find((page) => page.name === "Feedback Page")?.tags,
    ).toEqual([]);

    await replaceSourceTags(database.db, source.id, [support.id]);
    const createdPage = (await first.json()) as { pageId: string };
    const detail = await handler.get(
      request(`/api/admin/v1/pages/${createdPage.pageId}`, token),
      createdPage.pageId,
    );
    await expect(detail.json()).resolves.toMatchObject({ tags: [support] });
  });

  test("updates mutable Page settings while keeping identity immutable", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: [], altchaEnabled: true, challengeRateLimitPerMinute: null,
      fieldDefinitionMode: "json-schema",
      fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","maxLength":254}},"required":["email"],"additionalProperties":false}',
      honeypotEnabled: false, honeypotFieldNames: form.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: "Contact", retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
    });
    const handler = createAdminPagesHandler({
      baseUrl,
      database: database.db,
    });
    const firstResponse = await handler.create(request("/api/admin/v1/pages", token, {
      body: JSON.stringify({ sourceId: form.id, name: "First" }), method: "POST",
    }));
    const first = await firstResponse.json() as { pageId: string };

    const updated = await handler.update(request(`/api/admin/v1/pages/${first.pageId}`, token, {
      body: JSON.stringify({
        enabled: true,
        name: "Campaign page",
        presentation: { qrCaption: "Scan campaign", title: "Contact" },
      }),
      method: "PATCH",
    }), first.pageId);
    expect(updated.status).toBe(200);
    const updatedPage = await updated.json() as {
      fields: Array<{ name: string }>;
      enabled: boolean;
      name: string;
      pageId: string;
      publicUrl: string;
    };
    expect(updatedPage).toMatchObject({
      enabled: true,
      name: "Campaign page",
      pageId: first.pageId,
      publicUrl: `https://forman.example.test/pages/${first.pageId}`,
    });

    const identityUpdate = await handler.update(request(`/api/admin/v1/pages/${first.pageId}`, token, {
      body: JSON.stringify({
        enabled: true,
        sourceId: "different-source",
        name: "Campaign page",
        pageId: "different-page",
        presentation: null,
      }),
      method: "PATCH",
    }), first.pageId);
    expect(identityUpdate.status).toBe(400);

    const removed = await handler.delete(request(`/api/admin/v1/pages/${first.pageId}`, token, { method: "DELETE" }), first.pageId);
    expect(removed.status).toBe(204);
    expect((await handler.get(request(`/api/admin/v1/pages/${first.pageId}`, token), first.pageId)).status).toBe(404);
  });


  test("rejects Page creation for a missing Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const response = await createAdminPagesHandler({
      baseUrl,
      database: database.db,
    }).create(request("/api/admin/v1/pages", token, {
      body: JSON.stringify({ sourceId: "missing", name: "Missing source" }),
      method: "POST",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Source not found" });
  });

  test("rejects Page creation when the Source has no Form fields", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });

    const response = await createAdminPagesHandler({
      baseUrl,
      database: database.db,
    }).create(request("/api/admin/v1/pages", token, {
      body: JSON.stringify({ sourceId: source.id, name: "Contact Page" }),
      method: "POST",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The Source needs a valid Source fields definition before a Built-in Form can be created.",
    });
  });
});
