import { like, or, sql, type SQLWrapper } from "drizzle-orm";
import { sources } from "@/server/db/schema";

/** Shared by review rows/counts and completed-submission bulk operations. */
export function submissionSearchCondition(
  search: string | undefined,
  record: { sourceId: SQLWrapper; payloadJson: Parameters<typeof like>[0]; referer: Parameters<typeof like>[0]; userAgent: Parameters<typeof like>[0] },
) {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${term}%`;
  return or(
    like(record.payloadJson, pattern),
    like(record.referer, pattern),
    like(record.userAgent, pattern),
    sql`${record.sourceId} in (select ${sources.id} from ${sources} where ${like(sources.name, pattern)})`,
  );
}
