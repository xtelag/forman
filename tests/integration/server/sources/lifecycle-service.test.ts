import { afterEach, describe, expect, test } from "vitest";

import {
  deleteDeactivatedSource,
  setSourceEnabled,
  updateSourceConfiguration,
} from "@/server/sources/lifecycle-service";
import { createSource, findActiveSourceBySourceId } from "@/server/sources/source-service";
import { submissions } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("Source lifecycle service", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("deactivates and reactivates a Source for public intake", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });

    await expect(setSourceEnabled(database.db, form.id, false)).resolves.toBe(true);
    await expect(findActiveSourceBySourceId(database.db, form.sourceId)).resolves.toBeNull();
    await expect(setSourceEnabled(database.db, form.id, true)).resolves.toBe(true);
    await expect(findActiveSourceBySourceId(database.db, form.sourceId)).resolves.toMatchObject({ id: form.id });
  });

  test("allows deletion only after deactivation and cascades captured data", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    await database.db.insert(submissions).values({ id: "submission", sourceId: form.id, payloadJson: "{}", createdAt: new Date() });

    await expect(deleteDeactivatedSource(database.db, form.id)).resolves.toBe(false);
    await setSourceEnabled(database.db, form.id, false);
    await expect(deleteDeactivatedSource(database.db, form.id)).resolves.toBe(true);
    expect(database.client.prepare("select count(*) as count from submission").get()).toEqual({ count: 0 });
  });

  test("updates Source policy with valid origins, limits, metadata, and retention", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });

    await expect(updateSourceConfiguration(database.db, form.id, {
      allowedOrigins: ["https://www.example.test"],
      altchaEnabled: true,
      challengeRateLimitPerMinute: 80,
      honeypotEnabled: true,
      maxBodyBytes: 100_000,
      maxEntries: 100,
      maxKeyLength: 120,
      maxUniqueKeys: 40,
      maxValueLength: 12_000,
      maxValuesPerKey: 25,
      name: "Customer contact",
      retentionDays: 90,
      submissionRateLimitPerMinute: 40,
      storeReferer: true,
      storeUserAgent: true,
      successUrl: "https://www.example.test/confirmation",
    })).resolves.toBe("saved");

    await expect(findActiveSourceBySourceId(database.db, form.sourceId)).resolves.toMatchObject({
      allowedOrigins: ["https://www.example.test"],
      altchaEnabled: true,
      challengeRateLimitPerMinute: 80,
      honeypotEnabled: true,
      maxEntries: 100,
      name: "Customer contact",
      retentionDays: 90,
      submissionRateLimitPerMinute: 40,
      storeReferer: true,
      storeUserAgent: true,
      successUrl: "https://www.example.test/confirmation",
    });
  });

  test("does not allow a Source to be renamed to another friendly name", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const first = await createSource(database.db, { name: "Contact", type: "one-shot" });
    const second = await createSource(database.db, { name: "Feedback", type: "one-shot" });

    const configuration = {
      allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null, honeypotEnabled: false, maxBodyBytes: 65_536, maxEntries: 50,
      maxKeyLength: 100, maxUniqueKeys: 30, maxValueLength: 10_000, maxValuesPerKey: 20,
      name: "  CONTACT  ", retentionDays: null, storeReferer: false, storeUserAgent: false,
      submissionRateLimitPerMinute: null, successUrl: null,
    };

    await expect(updateSourceConfiguration(database.db, second.id, configuration)).resolves.toBe("friendly-name-conflict");
    await expect(findActiveSourceBySourceId(database.db, first.sourceId)).resolves.toMatchObject({ name: "Contact" });
    await expect(findActiveSourceBySourceId(database.db, second.sourceId)).resolves.toMatchObject({ name: "Feedback" });
  });
});
