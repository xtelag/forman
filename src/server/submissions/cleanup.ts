import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";

import { deleteSubmissionsWhere } from "./delete-service";
import type { createDatabase } from "@/server/db/client";
import { pipelineActionRuns, configuredInboxItems, sources, submissions } from "@/server/db/schema";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export async function cleanupExpiredSubmissions(
  database: FormanDatabase,
  now = new Date(),
) {
  const retainedForms = await database
    .select({ id: sources.id, retentionDays: sources.retentionDays })
    .from(sources)
    .where(isNotNull(sources.retentionDays))
    .all();
  let deleted = 0;

  for (const form of retainedForms) {
    const cutoff = new Date(
      now.getTime() - form.retentionDays! * 24 * 60 * 60 * 1_000,
    );
    deleted += deleteSubmissionsWhere(database,
      and(eq(submissions.sourceId, form.id), lt(submissions.createdAt, cutoff)),
    );
  }

  return deleted;
}

export async function cleanupExpiredFailedActionRuns(
  database: FormanDatabase,
  retentionDays: number,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  return database
    .delete(pipelineActionRuns)
    .where(
      and(
        eq(pipelineActionRuns.status, "failed"),
        or(
          lt(pipelineActionRuns.updatedAt, cutoff),
          and(
            isNull(pipelineActionRuns.updatedAt),
            lt(pipelineActionRuns.createdAt, cutoff),
          ),
        ),
      ),
    )
    .run();
}

export async function moveExpiredInboxItemsToTrash(
  database: FormanDatabase,
  retentionDays: number,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  return database
    .update(configuredInboxItems)
    .set({
      preTrashState: configuredInboxItems.state,
      trashedAt: now,
      updatedAt: now,
    })
    .where(and(isNull(configuredInboxItems.trashedAt), lt(configuredInboxItems.createdAt, cutoff)))
    .run();
}
