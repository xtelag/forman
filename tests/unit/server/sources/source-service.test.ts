import { afterEach, describe, expect, test } from "vitest";

import {
  createSource,
  FriendlyNameConflictError,
  findSourceBySourceId,
  findActiveSourceBySourceId,
} from "@/server/sources/source-service";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("form service", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.dispose();
    }
  });

  test("creates an active form with a short public identifier and safe defaults", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    const form = await createSource(database.db, { name: "Contact form", type: "one-shot" });

    expect(form).toMatchObject({
      name: "Contact form",
      enabled: true,
      allowedOrigins: [],
      altchaEnabled: true,
      honeypotEnabled: false,
      honeypotFieldNames: [expect.stringMatching(/^[a-z][a-z0-9_]{2,63}$/)],
      retentionDays: null,
      storeReferer: false,
      storeUserAgent: false,
    });
    expect(form.sourceId).toMatch(/^[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);
    expect(database.client.prepare("select token from server_submission_token where source_id = ?").get(form.id)).toBeUndefined();
    await expect(findSourceBySourceId(database.db, form.sourceId.toUpperCase())).resolves.toMatchObject({ id: form.id, honeypotFieldNames: form.honeypotFieldNames });

    const secondForm = await createSource(database.db, { name: "Second contact form", type: "one-shot" });
    expect(secondForm.sourceId).not.toBe(form.sourceId);
  });

  test.each(["one-shot", "session", "m2m"] as const)("persists protection defaults for %s", async type => {
    const database = createTestDatabase(); databases.push(database);
    const source = await createSource(database.db, { name: `Default ${type}`, type });
    const expected = { altchaEnabled: type !== "m2m", honeypotEnabled: false };
    expect(source).toMatchObject(expected);
    expect(await findSourceBySourceId(database.db, source.sourceId)).toMatchObject(expected);
  });

  test("retries a colliding public identifier", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const candidates = ["a2b3c4d5e6", "a2b3c4d5e6", "z9y8x7w6v5"];
    const generateSourceId = () => candidates.shift()!;

    await createSource(database.db, { name: "First form", type: "one-shot" }, generateSourceId);
    const form = await createSource(database.db, { name: "Second form", type: "one-shot" }, generateSourceId);

    expect(form.sourceId).toBe("z9y8x7w6v5");
  });

  test("rejects duplicate friendly names irrespective of case and surrounding whitespace", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    await createSource(database.db, { name: "Customer feedback", type: "one-shot" });

    await expect(createSource(database.db, { name: "  CUSTOMER FEEDBACK  ", type: "one-shot" })).rejects.toBeInstanceOf(
      FriendlyNameConflictError,
    );
  });

  test("distinguishes public intake from administrator lookup after deactivation", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact form", type: "one-shot" });

    expect(await findActiveSourceBySourceId(database.db, form.sourceId)).toMatchObject({ id: form.id });
    database.client.prepare("update source set enabled = false where id = ?").run(form.id);
    await expect(findActiveSourceBySourceId(database.db, form.sourceId)).resolves.toBeNull();
    await expect(findSourceBySourceId(database.db, form.sourceId)).resolves.toMatchObject({
      id: form.id,
      enabled: false,
      allowedOrigins: [],
    });
  });
});
