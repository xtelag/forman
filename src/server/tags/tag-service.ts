import { asc, count, eq, inArray } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { sources, sourceTags, tags } from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";

type Database = ReturnType<typeof createDatabase>["db"];

export type TagColor = "rose" | "coral" | "peach" | "amber" | "lemon" | "mint" | "emerald" | "teal" | "sky" | "blue" | "indigo" | "violet" | "fuchsia";

export type Tag = {
  color: TagColor;
  id: string;
  name: string;
};

function toTag(record: typeof tags.$inferSelect): Tag {
  return { color: record.color, id: record.id, name: record.name };
}

export async function createTag(
  database: Database,
  input: { color: TagColor; name: string },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Tag name is required");
  const now = new Date();
  const record = {
    color: input.color,
    createdAt: now,
    id: createResourceId(),
    name,
    updatedAt: now,
  } as const;
  database.insert(tags).values(record).run();
  return toTag(record);
}

export async function listTags(database: Database) {
  const records = await database.select().from(tags).orderBy(asc(tags.name)).all();
  return records.map(toTag);
}

export async function deleteTag(database: Database, id: string) {
  return database.transaction((transaction) => {
    const assignedSourceCount = transaction
      .select({ count: count() })
      .from(sourceTags)
      .where(eq(sourceTags.tagId, id))
      .get()?.count ?? 0;
    const deleted = transaction.delete(tags).where(eq(tags.id, id)).run().changes === 1;
    return { assignedSourceCount, deleted };
  });
}

export async function getTagUsage(database: Database, id: string) {
  const tag = await database.select({ id: tags.id }).from(tags).where(eq(tags.id, id)).get();
  if (!tag) return null;
  const assignedSources = await database
    .select({ name: sources.name })
    .from(sourceTags)
    .innerJoin(sources, eq(sourceTags.sourceId, sources.id))
    .where(eq(sourceTags.tagId, id))
    .orderBy(asc(sources.name))
    .all();
  return {
    assignedSourceCount: assignedSources.length,
    assignedSourceNames: assignedSources.map(({ name }) => name),
  };
}

export async function listTagsForSource(database: Database, sourceId: string) {
  return (await listTagsForSources(database, [sourceId])).get(sourceId) ?? [];
}

export async function listTagsForSources(
  database: Database,
  sourceIds: string[],
) {
  const uniqueSourceIds = [...new Set(sourceIds)];
  const result = new Map<string, Tag[]>(
    uniqueSourceIds.map((sourceId) => [sourceId, []]),
  );
  if (!uniqueSourceIds.length) return result;
  const records = await database
    .select({ sourceId: sourceTags.sourceId, tag: tags })
    .from(sourceTags)
    .innerJoin(tags, eq(sourceTags.tagId, tags.id))
    .where(inArray(sourceTags.sourceId, uniqueSourceIds))
    .orderBy(asc(tags.name))
    .all();
  for (const record of records) {
    result.get(record.sourceId)?.push(toTag(record.tag));
  }
  return result;
}

export async function replaceSourceTags(
  database: Database,
  sourceId: string,
  tagIds: string[],
) {
  const uniqueTagIds = [...new Set(tagIds)];
  database.transaction((transaction) => {
    transaction.delete(sourceTags).where(eq(sourceTags.sourceId, sourceId)).run();
    if (uniqueTagIds.length) {
      transaction
        .insert(sourceTags)
        .values(uniqueTagIds.map((tagId) => ({ sourceId, tagId })))
        .run();
    }
  });
  return listTagsForSource(database, sourceId);
}
