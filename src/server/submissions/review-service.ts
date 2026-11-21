import { submissionSearchCondition } from "./search-condition";
import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";
import type { createDatabase } from "@/server/db/client";
import { sources, sourceSessions, sourceTags, submissions } from "@/server/db/schema";
import { expireSourceSessions } from "@/server/source-sessions/session-service";
import { listTagsForSources } from "@/server/tags/tag-service";
import { parseStoredSubmissionPayload } from "@/shared/contracts/submission";
import { getSubmission } from "./query-service";

type Database = ReturnType<typeof createDatabase>["db"];
type ReviewQuery = { snapshotBefore?: Date; sourceId?: string; from?: Date; to?: Date; search?: string; tagIds?: string[]; limit?: number; offset?: number; type?: string; state?: string };

function reviewRecords(database: Database) {
  return unionAll(
    database.select({
      id: submissions.id, sourceId: submissions.sourceId, createdAt: submissions.createdAt,
      payloadJson: submissions.payloadJson, referer: submissions.referer, userAgent: submissions.userAgent,
      sessionUpdateCount: submissions.sessionUpdateCount, sessionRequestCount: submissions.sessionRequestCount,
      type: sql<"one-shot" | "session">`case when ${submissions.sessionUpdateCount} is null then 'one-shot' else 'session' end`.as("review_type"),
      state: sql<"draft" | "completed" | "expired">`'completed'`.as("state"),
    }).from(submissions),
    database.select({
      id: sql<string>`'session-' || ${sourceSessions.id}`, sourceId: sourceSessions.sourceId, createdAt: sourceSessions.createdAt,
      payloadJson: sourceSessions.payloadJson, referer: sql<string | null>`null`, userAgent: sql<string | null>`null`,
      sessionUpdateCount: sourceSessions.updateCount, sessionRequestCount: sourceSessions.requestCount,
      type: sql<"one-shot" | "session">`'session'`, state: sourceSessions.status,
    }).from(sourceSessions).where(isNull(sourceSessions.submissionId)),
  ).as("review");
}

export async function listSubmissionReview(database: Database, query: ReviewQuery = {}) {
  expireSourceSessions(database);
  const review = reviewRecords(database);
  const conditions = and(
    query.snapshotBefore ? lt(review.createdAt, query.snapshotBefore) : undefined,
    query.sourceId ? eq(review.sourceId, query.sourceId) : undefined,
    query.from ? gte(review.createdAt, query.from) : undefined,
    query.to ? lt(review.createdAt, query.to) : undefined,
    query.type === "one-shot" || query.type === "session" ? eq(review.type, query.type) : undefined,
    ["draft", "completed", "expired"].includes(query.state ?? "") ? eq(review.state, query.state!) : undefined,
    submissionSearchCondition(query.search, review),
    query.tagIds?.length ? inArray(review.sourceId, database.select({ sourceId: sourceTags.sourceId }).from(sourceTags).where(inArray(sourceTags.tagId, query.tagIds))) : undefined,
  );
  const rows = database.select({ record: { id: review.id, sourceId: review.sourceId, createdAt: review.createdAt, payloadJson: review.payloadJson, referer: review.referer, userAgent: review.userAgent, sessionUpdateCount: review.sessionUpdateCount, sessionRequestCount: review.sessionRequestCount, type: review.type, state: review.state }, sourcePublicId: sources.sourceId, sourceName: sources.name }).from(review).innerJoin(sources, eq(sources.id, review.sourceId)).where(conditions).orderBy(desc(review.createdAt), desc(review.id)).limit(Math.min(Math.max(query.limit ?? 50, 1), 10000)).offset(Math.max(query.offset ?? 0, 0)).all();
  const totals = database.select({ total: count(), deletableTotal: sql<number>`coalesce(sum(case when ${review.state} = 'completed' then 1 else 0 end), 0)` }).from(review).where(conditions).get()!;
  const tags = await listTagsForSources(database, rows.map(row => row.record.sourceId));
  return { ...totals, items: rows.map(({ record, ...source }) => ({ ...record, ...source, payload: parseStoredSubmissionPayload(record.payloadJson), tags: tags.get(record.sourceId) ?? [] })) };
}

type ReviewDetail = NonNullable<Awaited<ReturnType<typeof getSubmission>>> & { type: "one-shot" | "session"; state: "draft" | "completed" | "expired" };
export async function getSubmissionReview(database: Database, id: string): Promise<ReviewDetail | null> {
  if (!id.startsWith("session-")) {
    const record = await getSubmission(database, id);
    return record ? { ...record, type: record.sessionUpdateCount === null ? "one-shot" as const : "session" as const, state: "completed" as const } : null;
  }
  expireSourceSessions(database);
  const session = database.select().from(sourceSessions).where(eq(sourceSessions.id, id.slice(8))).get();
  if (!session) return null;
  // A draft link continues to resolve to the accepted snapshot after finalization.
  if (session.submissionId) return getSubmissionReview(database, session.submissionId);
  const source = database.select().from(sources).where(eq(sources.id, session.sourceId)).get();
  if (!source) return null;
  const tags = await listTagsForSources(database, [source.id]);
  return { id, sourceId: source.id, sourcePublicId: source.sourceId, sourceName: source.name, createdAt: session.createdAt, payloadJson: session.payloadJson, payload: parseStoredSubmissionPayload(session.payloadJson), referer: null, userAgent: null, sessionUpdateCount: session.updateCount, sessionRequestCount: session.requestCount, type: "session" as const, state: session.status, tags: tags.get(source.id) ?? [], pipelineRuns: [] };
}
