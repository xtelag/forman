import { afterEach, describe, expect, test } from "vitest";

import { runMigrations } from "@/server/db/migrate";
import { createSource } from "@/server/sources/source-service";
import { createTag, deleteTag, getTagUsage, listTags, listTagsForSource, replaceSourceTags } from "@/server/tags/tag-service";
import { createTestDatabase } from "../../../helpers/database";

describe("tag service", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("replaces a Source's tags while preserving globally reusable tags", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const sales = await createTag(database.db, { color: "blue", name: "Sales" });
    const support = await createTag(database.db, { color: "violet", name: "Support" });

    await replaceSourceTags(database.db, source.id, [sales.id]);
    expect(await listTagsForSource(database.db, source.id)).toEqual([sales]);

    await replaceSourceTags(database.db, source.id, [support.id]);
    expect(await listTagsForSource(database.db, source.id)).toEqual([support]);
  });

  test("reports the Sources affected when deleting a global tag and its assignments", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const sales = await createTag(database.db, { color: "blue", name: "Sales" });
    await replaceSourceTags(database.db, source.id, [sales.id]);

    const secondSource = await createSource(database.db, { type: "one-shot", name: "Sales inquiry" });
    await replaceSourceTags(database.db, secondSource.id, [sales.id]);

    await expect(deleteTag(database.db, sales.id)).resolves.toEqual({
      assignedSourceCount: 2,
      deleted: true,
    });
    await expect(listTags(database.db)).resolves.toEqual([]);
    await expect(listTagsForSource(database.db, source.id)).resolves.toEqual([]);
  });

  test("lists assigned Source names alphabetically for the deletion warning", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const zebra = await createSource(database.db, { type: "one-shot", name: "Zebra inquiry" });
    const alpha = await createSource(database.db, { type: "one-shot", name: "Alpha contact" });
    const sales = await createTag(database.db, { color: "blue", name: "Sales" });
    await replaceSourceTags(database.db, zebra.id, [sales.id]);
    await replaceSourceTags(database.db, alpha.id, [sales.id]);

    await expect(getTagUsage(database.db, sales.id)).resolves.toEqual({
      assignedSourceCount: 2,
      assignedSourceNames: ["Alpha contact", "Zebra inquiry"],
    });
  });
});
