import { listSubmissionReview } from "@/server/submissions/review-service";
import { afterEach, describe, expect, test } from "vitest";

import { deleteMatchingSubmissions, deleteSubmission, getObservedFieldNames, getSubmission, listSubmissions } from "@/server/submissions/query-service";
import { createSource } from "@/server/sources/source-service";
import { submissions } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createTag, replaceSourceTags } from "@/server/tags/tag-service";
import { createTestDatabase } from "../../../helpers/database";

describe("listSubmissions", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("matches a Source name consistently in review, counts and filtered deletion", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Example Form 4" });
    const other = await createSource(database.db, { type: "one-shot", name: "Example Form 3" });
    await database.db.insert(submissions).values([
      { id: "match", sourceId: form.id, payloadJson: "{}", createdAt: new Date("2026-01-01") },
      { id: "excluded", sourceId: form.id, payloadJson: "{}", createdAt: new Date("2026-01-02") },
      { id: "other", sourceId: other.id, payloadJson: "{}", createdAt: new Date("2026-01-03") },
    ]);
    const filter = { search: " form 4 " };
    await expect(listSubmissionReview(database.db, { ...filter, limit: 1 })).resolves.toMatchObject({
      total: 2, deletableTotal: 2, items: [{ id: "excluded" }],
    });
    await expect(listSubmissions(database.db, filter)).resolves.toMatchObject({ total: 2 });
    await expect(deleteMatchingSubmissions(database.db, {
      ...filter, excludedIds: ["excluded"], snapshotBefore: new Date("2026-02-01"),
    })).resolves.toBe(1);
    await expect(listSubmissions(database.db)).resolves.toMatchObject({
      total: 2, items: [{ id: "other" }, { id: "excluded" }],
    });
  });

  test("returns newest rows and searches field names and values", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const contact = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const survey = await createSource(database.db, { type: "one-shot", name: "Survey" });
    await database.db.insert(submissions).values([
      { id: "first", sourceId: contact.id, payloadJson: JSON.stringify({ email: ["first@example.test"] }), createdAt: new Date("2026-01-01T00:00:00Z"), referer: "https://www.example.test/contact", userAgent: "Forman test" },
      { id: "second", sourceId: survey.id, payloadJson: JSON.stringify({ answer: ["Purple"] }), createdAt: new Date("2026-01-02T00:00:00Z") },
    ]);

    await expect(listSubmissions(database.db)).resolves.toMatchObject({
      total: 2,
      items: [{ id: "second" }, { id: "first", referer: "https://www.example.test/contact", userAgent: "Forman test" }],
    });
    await expect(listSubmissions(database.db, { search: "email" })).resolves.toMatchObject({
      total: 1,
      items: [{ id: "first", payload: { email: ["first@example.test"] } }],
    });
    await expect(listSubmissions(database.db, { sourceId: survey.id, search: "purple" })).resolves.toMatchObject({
      total: 1,
      items: [{ id: "second" }],
    });
    await expect(listSubmissions(database.db, { search: "contact" })).resolves.toMatchObject({
      total: 1,
      items: [{ id: "first" }],
    });
    await expect(listSubmissions(database.db, { limit: 1, offset: 1 })).resolves.toMatchObject({
      total: 2,
      items: [{ id: "first" }],
    });
    await expect(listSubmissions(database.db, {
      from: new Date("2026-01-02T00:00:00Z"),
      to: new Date("2026-01-03T00:00:00Z"),
    })).resolves.toMatchObject({ total: 1, items: [{ id: "second" }] });
  });

  test("retrieves and deletes one submission without affecting another", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await database.db.insert(submissions).values([
      { id: "first", sourceId: form.id, payloadJson: JSON.stringify({ email: ["first@example.test"] }), createdAt: new Date() },
      { id: "second", sourceId: form.id, payloadJson: JSON.stringify({ email: ["second@example.test"] }), createdAt: new Date() },
    ]);

    await expect(getSubmission(database.db, "first")).resolves.toMatchObject({ id: "first", payload: { email: ["first@example.test"] } });
    await expect(deleteSubmission(database.db, "first")).resolves.toBe(true);
    await expect(getSubmission(database.db, "first")).resolves.toBeNull();
    await expect(getSubmission(database.db, "second")).resolves.toMatchObject({ id: "second" });
  });

  test("filters and bulk-deletes submissions whose Source has any selected tag", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const [sales, support] = await Promise.all([
      createTag(database.db, { color: "blue", name: "Sales" }),
      createTag(database.db, { color: "violet", name: "Support" }),
    ]);
    const [salesForm, supportForm, otherForm] = await Promise.all([
      createSource(database.db, { type: "one-shot", name: "Sales form" }),
      createSource(database.db, { type: "one-shot", name: "Support form" }),
      createSource(database.db, { type: "one-shot", name: "Other form" }),
    ]);
    await Promise.all([
      replaceSourceTags(database.db, salesForm.id, [sales.id]),
      replaceSourceTags(database.db, supportForm.id, [support.id]),
    ]);
    await database.db.insert(submissions).values([
      { id: "sales", sourceId: salesForm.id, payloadJson: "{}", createdAt: new Date("2026-08-20T10:00:00.000Z") },
      { id: "support", sourceId: supportForm.id, payloadJson: "{}", createdAt: new Date("2026-08-20T11:00:00.000Z") },
      { id: "other", sourceId: otherForm.id, payloadJson: "{}", createdAt: new Date("2026-08-20T12:00:00.000Z") },
    ]);

    await expect(listSubmissions(database.db, { tagIds: [sales.id, support.id] })).resolves.toMatchObject({
      items: [{ id: "support" }, { id: "sales" }],
      total: 2,
    });
    await expect(deleteMatchingSubmissions(database.db, { tagIds: [sales.id, support.id] })).resolves.toBe(2);
    await expect(listSubmissions(database.db)).resolves.toMatchObject({
      items: [{ id: "other" }],
      total: 1,
    });
  });

  test("lists each observed field name once for table-column selection", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });
    await database.db.insert(submissions).values([
      { id: "first", sourceId: form.id, payloadJson: JSON.stringify({ email: ["first@example.test"], message: ["Hello"] }), createdAt: new Date() },
      { id: "second", sourceId: form.id, payloadJson: JSON.stringify({ email: ["second@example.test"], topic: ["Support"] }), createdAt: new Date() },
    ]);

    await expect(getObservedFieldNames(database.db, form.id)).resolves.toEqual(["email", "message", "topic"]);
  });
});
