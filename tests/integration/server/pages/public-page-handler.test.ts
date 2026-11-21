import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { afterEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { runMigrations } from "@/server/db/migrate";
import { pages, sources } from "@/server/db/schema";
import { createSource } from "@/server/sources/source-service";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { createPage, updatePage } from "@/server/pages/page-service";
import { createPublicPageHandler } from "@/server/pages/public-page-handler";
import { createTestDatabase } from "../../../helpers/database";

describe("public Page handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test.each(["one-shot", "session", "m2m"] as const)("uses Source type %s for public rendering and preview", async type => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, { type, name: "Typed source" });
    mutateSourceConfiguration(database.db, source.id, () => ({ fieldDefinitionMode: "json-schema", fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string"}},"additionalProperties":false}' }));
    database.db.insert(pages).values({ id: "typed-page", sourceId: source.id, pageId: "typed-page", name: "Typed form", enabled: true, createdAt: new Date(), updatedAt: new Date() }).run();
    const handler = createPublicPageHandler({ database: database.db });
    if (type === "m2m") {
      await expect(handler.get("typed-page")).resolves.toBeNull();
      await expect(handler.getPreview("typed-page")).resolves.toBeNull();
    } else {
      const model = { sessionsEnabled: type === "session", sessionUrl: `/api/submit/${source.sourceId}` };
      await expect(handler.get("typed-page")).resolves.toMatchObject(model);
      await expect(handler.getPreview("typed-page")).resolves.toMatchObject({ ...model, preview: true });
    }
  });

  test("renders the selected Page presentation with the associated Source endpoint", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null,
      fieldDefinitionMode: "json-schema",
      fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","format":"email","maxLength":254}},"required":["email"],"additionalProperties":false}',
      honeypotEnabled: false, honeypotFieldNames: form.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: "Contact", retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
    });
    await createPage(database.db, { sourceId: form.id, name: "Prague" }, () => "abcdefgh02");
    await updatePage(database.db, "abcdefgh02", {
      enabled: true, name: "Prague",
      presentation: { systemTexts: {submit: "Send"}, title: "Contact Prague" },
    });

    await expect(createPublicPageHandler({ database: database.db }).get("ABCDEFGH02")).resolves.toMatchObject({
      fields: [{ htmlControl: "email", name: "email", required: true }],
      sourceId: form.sourceId,
      pageId: "abcdefgh02",
      submissionUrl: `/api/submit/${form.sourceId}?page=abcdefgh02`,
      submitLabel: "Send",
      title: "Contact Prague",
    });
  });

  test("hides draft Pages", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null,
      fieldDefinitionMode: "json-schema",
      fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","format":"email","maxLength":254}},"required":["email"],"additionalProperties":false}',
      honeypotEnabled: false, honeypotFieldNames: form.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: "Contact", retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
    });
    await createPage(database.db, { sourceId: form.id, name: "Draft" }, () => "abcdefgh02");

    await expect(createPublicPageHandler({ database: database.db }).get("abcdefgh02")).resolves.toBeNull();
  });

  test("renders draft Pages for an administrator local preview", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null,
      fieldDefinitionMode: "json-schema",
      fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","format":"email","maxLength":254}},"required":["email"],"additionalProperties":false}',
      honeypotEnabled: false, honeypotFieldNames: form.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: "Contact", retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
    });
    await createPage(database.db, { sourceId: form.id, name: "Draft" }, () => "abcdefgh02");

    const handler = createPublicPageHandler({ database: database.db });
    await expect(handler.get("abcdefgh02")).resolves.toBeNull();
    await expect(handler.getPreview("abcdefgh02")).resolves.toMatchObject({
      pageId: "abcdefgh02",
      title: "Draft",
    });
  });

  test("hides published Pages when the source Source is inactive or its fields become invalid", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null,
      fieldDefinitionMode: "json-schema",
      fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","format":"email","maxLength":254}},"required":["email"],"additionalProperties":false}',
      honeypotEnabled: false, honeypotFieldNames: form.honeypotFieldNames,
      maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
      maxValueLength: 10_000, maxValuesPerKey: 20, name: "Contact", retentionDays: null,
      storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
    });
    await createPage(database.db, { sourceId: form.id, name: "Campaign" }, () => "abcdefgh02");
    await updatePage(database.db, "abcdefgh02", {
      enabled: true, name: "Campaign", presentation: null,
    });
    const handler = createPublicPageHandler({ database: database.db });

    database.db.update(sources).set({ enabled: false }).where(eq(sources.id, form.id)).run();
    await expect(handler.get("abcdefgh02")).resolves.toBeNull();

    database.db.update(sources).set({ enabled: true }).where(eq(sources.id, form.id)).run();
    mutateSourceConfiguration(database.db, form.id, () => ({  fieldDefinitionSource: "invalid" }));
    await expect(handler.get("abcdefgh02")).resolves.toBeNull();
  });
});
