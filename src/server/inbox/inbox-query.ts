import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import type { createDatabase } from "@/server/db/client";
import {
  configuredInboxItems as inbox,
  sources,
  sourceTags,
} from "@/server/db/schema";
import { inboxPreview } from "@/shared/inbox-preview";
import { listTagsForSources, type Tag } from "@/server/tags/tag-service";
import { parseDateInput } from "@/shared/format/date";

type Database = ReturnType<typeof createDatabase>["db"];
export type InboxFilters = {
  from: Date | undefined;
  search: string | null;
  sourceId: string | null;
  state: string | null;
  tagIds: string[];
  trash: boolean;
  to: Date | undefined;
};

export function parseInboxFilters(parameters: URLSearchParams): InboxFilters {
  return {
    from: parseDateInput(parameters.get("from")),
    search: parameters.get("search")?.trim() || null,
    sourceId: parameters.get("sourceId"),
    state: parameters.get("state"),
    tagIds: parameters.getAll("tagId").filter(Boolean),
    trash: parameters.get("view") === "trash",
    to: parseDateInput(parameters.get("to"), true),
  };
}

function inboxConditions(
  database: Pick<Database, "select">,
  filters: InboxFilters,
) {
  return and(
    filters.trash ? isNotNull(inbox.trashedAt) : isNull(inbox.trashedAt),
    filters.sourceId ? eq(inbox.sourceId, filters.sourceId) : undefined,
    filters.state
      ? eq(inbox.state, filters.state as typeof inbox.$inferSelect.state)
      : undefined,
    filters.from ? gte(inbox.createdAt, filters.from) : undefined,
    filters.to ? lt(inbox.createdAt, filters.to) : undefined,
    filters.tagIds.length
      ? inArray(
          inbox.sourceId,
          database
            .select({ id: sourceTags.sourceId })
            .from(sourceTags)
            .where(
              sql`${sourceTags.tagId} in (select value from json_each(${JSON.stringify(filters.tagIds)}))`,
            ),
        )
      : undefined,
    filters.search
      ? sql`forman_inbox_matches(${inbox.id}, ${inbox.payloadJson}, ${inbox.sourceName}, ${inbox.actionName}, ${inbox.submissionId}, ${filters.search}) = 1`
      : undefined,
  );
}

function selectInbox(
  database: Pick<Database, "select">,
  filters: InboxFilters,
) {
  return database
    .select({ ...getTableColumns(inbox), sourcePublicId: sources.sourceId })
    .from(inbox)
    .leftJoin(sources, eq(inbox.sourceId, sources.id))
    .where(inboxConditions(database, filters))
    .orderBy(desc(inbox.createdAt), desc(inbox.id));
}

async function hydrateInbox(
  database: Database,
  rows: ReturnType<ReturnType<typeof selectInbox>["all"]>,
) {
  const sourceIds = [
    ...new Set(rows.flatMap((row) => (row.sourceId ? [row.sourceId] : []))),
  ];
  const tags = new Map<string, Tag[]>();
  for (let offset = 0; offset < sourceIds.length; offset += 500) {
    for (const [id, values] of await listTagsForSources(
      database,
      sourceIds.slice(offset, offset + 500),
    ))
      tags.set(id, values);
  }
  return rows.map((row) => ({
    ...row,
    preview: inboxPreview(JSON.parse(row.payloadJson)),
    tags: row.sourceId ? (tags.get(row.sourceId) ?? []) : [],
  }));
}

export async function listInboxPage(
  database: Database,
  filters: InboxFilters,
  limit: number,
  offset: number,
) {
  const { rows, total, hasTrash } = database.transaction((transaction) => ({
    rows: selectInbox(transaction, filters).limit(limit).offset(offset).all(),
    hasTrash: Boolean(transaction.select({ id: inbox.id }).from(inbox).where(isNotNull(inbox.trashedAt)).limit(1).get()),
    total:
      transaction
        .select({ value: count() })
        .from(inbox)
        .where(inboxConditions(transaction, filters))
        .get()?.value ?? 0,
  }));
  return { items: await hydrateInbox(database, rows), total, hasTrash };
}

export async function listFilteredInboxItems(
  database: Database,
  filters: InboxFilters,
) {
  return hydrateInbox(database, selectInbox(database, filters).all());
}

/** Capture IDs only; never download response payloads for bulk selection. */
export function selectInboxIds(database: Database, filters: InboxFilters) {
  return database.select({id: inbox.id}).from(inbox)
    .where(inboxConditions(database, filters)).orderBy(desc(inbox.createdAt), desc(inbox.id)).all().map(row => row.id);
}
