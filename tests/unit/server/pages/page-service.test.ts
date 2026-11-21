import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { afterEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { runMigrations } from "@/server/db/migrate";
import { sources } from "@/server/db/schema";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { createSource } from "@/server/sources/source-service";
import {
  createPage,
  findPageByPublicId,
  listPages,
  updatePage,
} from "@/server/pages/page-service";
import { createTestDatabase } from "../../../helpers/database";

async function createPageSource(
  database: ReturnType<typeof createTestDatabase>,
  name: string,
  type: "one-shot" | "session" | "m2m" = "one-shot",
) {
  const source = await createSource(database.db, { type, name });
  await updateSourceConfiguration(database.db, source.id, {
    allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null,
    fieldDefinitionMode: "json-schema",
    fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"string","maxLength":254}},"required":["email"],"additionalProperties":false}',
    honeypotEnabled: false, honeypotFieldNames: source.honeypotFieldNames,
    maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100, maxUniqueKeys: 30,
    maxValueLength: 10_000, maxValuesPerKey: 20, name, retentionDays: null,
    storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
  });
  return source;
}

describe("Page service", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];



  afterEach(() =>
    databases.splice(0).forEach((database) => database.dispose()),
  );

  test("changes publication without overwriting the name or presentation", async () => {
    const database = createTestDatabase(); databases.push(database);
    const source = await createPageSource(database, "Publication");
    const page = await createPage(database.db, {sourceId: source.id, name: "Custom form"}, () => "abcdefgh04");
    expect(page).toMatchObject({enabled: false});
    const before = await findPageByPublicId(database.db, "abcdefgh04");
    expect(await updatePage(database.db, "abcdefgh04", {enabled:true})).toMatchObject({enabled:true, name:before!.name, presentation:before!.presentation});
    expect(await updatePage(database.db, "abcdefgh04", {})).toBe("invalid");
  });

  test("new Session forms start with one field per step", async () => {
    const database=createTestDatabase();databases.push(database);
    const source=await createPageSource(database,"Survey","session");
    mutateSourceConfiguration(database.db, source.id, () => ({ fieldDefinitionSource: JSON.stringify({type:"object",properties:{name:{type:"string"},email:{type:"string"}},additionalProperties:false}) }));
    const page=await createPage(database.db,{sourceId:source.id,name:"Survey"});
    expect(page).toMatchObject({presentation:{steps:[{id:1,title:""},{id:2,title:""}],fields:[{name:"name",order:0,step:1},{name:"email",order:1,step:2}]}});
  });

  test("creates multiple independently configured Pages for one Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createPageSource(database, "Contact");

    const first = await createPage(
      database.db,
      { sourceId: form.id, name: "Contact Prague" },
      () => "abcdefgh02",
    );
    const second = await createPage(
      database.db,
      { sourceId: form.id, name: "Contact Brno" },
      () => "abcdefgh03",
    );

    expect(first).toMatchObject({
      enabled: false,
      sourceId: form.id,
      sourceName: "Contact",
      name: "Contact Prague",
      pageId: "abcdefgh02",
      presentation: { fields: [{ name: "email", order: 0, step: 1 }] },
    });
    expect(second).toMatchObject({ sourceId: form.id, pageId: "abcdefgh03" });
    await expect(listPages(database.db)).resolves.toHaveLength(2);
  });

  test("reports a missing Source without the legacy Form result", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    await expect(
      createPage(database.db, { sourceId: "missing", name: "Contact" }),
    ).resolves.toBe("missing-source");
  });

  test("rejects Built-in Forms for M2M Sources even with configured fields", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createPageSource(database, "Trusted", "m2m");
    await expect(createPage(database.db, { sourceId: source.id, name: "Invalid form" })).resolves.toBe("invalid");
    await expect(listPages(database.db)).resolves.toEqual([]);
  });

  test.each(["one-shot", "session"] as const)("derives %s form mode from immutable Source type", async type => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createPageSource(database, "Contact", type);
    await expect(createPage(database.db, { sourceId: source.id, name: "Contact form" })).resolves.toMatchObject({ sourceType: type, sessionsEnabled: type === "session" });
  });

  test("updates mutable Page settings without requiring immutable identity fields", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createPageSource(database, "Contact");
    await createPage(
      database.db,
      { sourceId: form.id, name: "Prague" },
      () => "abcdefgh02",
    );

    await expect(
      updatePage(
        database.db,
        "abcdefgh02",
        {
          enabled: false,
          name: "Prague campaign",
          presentation: {
            qrCaption: "Scan Prague",
            title: "Contact Prague",
          },
        },
      ),
    ).resolves.toMatchObject({
      sourceId: form.id,
      name: "Prague campaign",
      pageId: "abcdefgh02",
      presentation: { qrCaption: "Scan Prague", title: "Contact Prague" },
    });
  });

  test("rejects Source and Page ID fields in Page updates", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const contact = await createPageSource(database, "Contact");
    const survey = await createSource(database.db, { type: "one-shot", name: "Survey" });
    await createPage(
      database.db,
      { sourceId: contact.id, name: "Prague" },
      () => "abcdefgh02",
    );

    await expect(
      updatePage(
        database.db,
        "abcdefgh02",
        {
          enabled: false,
          sourceId: survey.id,
          name: "Prague",
          pageId: "renamed-page",
          presentation: null,
        },
      ),
    ).resolves.toBe("invalid");
    await expect(
      findPageByPublicId(database.db, "abcdefgh02"),
    ).resolves.toMatchObject({
      sourceId: contact.id,
      pageId: "abcdefgh02",
    });
  });





  test("rejects invalid Page updates", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createPageSource(database, "Contact");
    await createPage(
      database.db,
      { sourceId: form.id, name: "Prague" },
      () => "abcdefgh02",
    );
    await expect(
      updatePage(
        database.db,
        "abcdefgh02",
        {
          enabled: false,
          name: "",
          presentation: null,
        },
      ),
    ).resolves.toBe("invalid");
  });

  test("rejects Page creation without Form fields and cascades Source deletion", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await expect(createPage(
      database.db,
      { sourceId: form.id, name: "Contact page" },
      () => "abcdefgh02",
    )).resolves.toBe("source-fields-required");
    await expect(listPages(database.db)).resolves.toEqual([]);
    database.db.delete(sources).where(eq(sources.id, form.id)).run();
    await expect(listPages(database.db)).resolves.toEqual([]);
  });
});
