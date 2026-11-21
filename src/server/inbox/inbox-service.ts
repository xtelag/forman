import { inboxPreview } from "@/shared/inbox-preview";
export { inboxPreview } from "@/shared/inbox-preview";

import { eq } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { configuredInboxItems, sources } from "@/server/db/schema";
import { listTagsForSource } from "@/server/tags/tag-service";

type Database = ReturnType<typeof createDatabase>["db"];

export async function getInboxItem(database: Database, id: string) {
  const item = await database
    .select()
    .from(configuredInboxItems)
    .where(eq(configuredInboxItems.id, id))
    .get();
  if (!item) return null;
  const sourceForm = item.sourceId
    ? await database
        .select({ sourcePublicId: sources.sourceId })
        .from(sources)
        .where(eq(sources.id, item.sourceId))
        .get()
    : null;
  return {
    ...item,
    sourcePublicId: sourceForm?.sourcePublicId ?? null,
    preview: inboxPreview(JSON.parse(item.payloadJson)),
    tags: item.sourceId ? await listTagsForSource(database, item.sourceId) : [],
  };
}
