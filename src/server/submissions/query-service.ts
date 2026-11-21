import { submissionSearchCondition } from "./search-condition";
import { and, count, desc, eq, gte, inArray, isNull, isNotNull, lt, sql } from "drizzle-orm";

import { deleteSubmissionsWhere } from "./delete-service";
import type { createDatabase } from "@/server/db/client";
import { sources, sourceTags, submissions } from "@/server/db/schema";
import { listPipelineRunSummariesForSubmission } from "@/server/pipelines/pipeline-run-query-service";
import { listTagsForSources } from "@/server/tags/tag-service";
import { parseStoredSubmissionPayload } from "@/shared/contracts/submission";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type SubmissionQuery = {
  type?: string;
  state?: string;
  excludedIds?: string[];
  sourceId?: string;
  from?: Date;
  limit?: number;
  offset?: number;
  search?: string;
  snapshotBefore?: Date;
  tagIds?: string[];
  to?: Date;
};

function submissionTagCondition(database: FormanDatabase, tagIds: string[] | undefined) {
  if (!tagIds?.length) return undefined;
  return inArray(submissions.sourceId, database.select({ sourceId: sourceTags.sourceId }).from(sourceTags)
    .where(sql`${sourceTags.tagId} in (select value from json_each(${JSON.stringify(tagIds)}))`));
}

function submissionConditions({ type, state, excludedIds = [], sourceId, from, search, snapshotBefore, tagCondition, to }: SubmissionQuery & { tagCondition?: ReturnType<typeof submissionTagCondition> }) {
  return [
    type === "session" ? isNotNull(submissions.sessionUpdateCount) : type === "one-shot" ? isNull(submissions.sessionUpdateCount) : undefined,
    state === "draft" || state === "expired" ? sql`0` : undefined,
    sourceId ? eq(submissions.sourceId, sourceId) : undefined,
    tagCondition,
    from ? gte(submissions.createdAt, from) : undefined,
    submissionSearchCondition(search, submissions),
    snapshotBefore ? lt(submissions.createdAt, snapshotBefore) : undefined,
    to ? lt(submissions.createdAt, to) : undefined,
    excludedIds.length > 0 ? sql`${submissions.id} not in (select value from json_each(${JSON.stringify(excludedIds)}))` : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);
}

export async function listSubmissions(
  database: FormanDatabase,
  { sourceId, from, limit = 50, offset = 0, search, tagIds, to }: SubmissionQuery = {},
) {
  const tagCondition = submissionTagCondition(database, tagIds);
  const conditions = submissionConditions({ sourceId, from, search, tagCondition, to });
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, totalRow] = await Promise.all([
    database
      .select({
        createdAt: submissions.createdAt,
        sourceId: submissions.sourceId,
        sourcePublicId: sources.sourceId,
        sourceName: sources.name,
        id: submissions.id,
        payloadJson: submissions.payloadJson,
        referer: submissions.referer,
        userAgent: submissions.userAgent,
        sessionUpdateCount: submissions.sessionUpdateCount,
        sessionRequestCount: submissions.sessionRequestCount,
      })
      .from(submissions)
      .innerJoin(sources, eq(submissions.sourceId, sources.id))
      .where(where)
      .orderBy(desc(submissions.createdAt))
      .limit(Math.min(Math.max(limit, 1), 10_000))
      .offset(Math.max(offset, 0))
      .all(),
    database.select({ value: count() }).from(submissions).where(where).get(),
  ]);

  const tagsBySourceId = await listTagsForSources(database, rows.map((row) => row.sourceId));

  return {
    items: rows.map((row) => ({
      ...row,
      payload: parseStoredSubmissionPayload(row.payloadJson),
      tags: tagsBySourceId.get(row.sourceId) ?? [],
    })),
    total: totalRow?.value ?? 0,
  };
}

export async function getSubmission(database: FormanDatabase, id: string) {
  const row = await database
    .select({
      createdAt: submissions.createdAt,
      sourceId: submissions.sourceId,
      sourcePublicId: sources.sourceId,
      sourceName: sources.name,
      id: submissions.id,
      payloadJson: submissions.payloadJson,
      referer: submissions.referer,
      userAgent: submissions.userAgent,
      sessionUpdateCount: submissions.sessionUpdateCount,
      sessionRequestCount: submissions.sessionRequestCount,
    })
    .from(submissions)
    .innerJoin(sources, eq(submissions.sourceId, sources.id))
    .where(eq(submissions.id, id))
    .get();
  if (!row) return null;
  const tagsBySourceId = await listTagsForSources(database, [row.sourceId]);
  const pipelineRuns = await listPipelineRunSummariesForSubmission(database, row.id);
  return {
    ...row,
    payload: parseStoredSubmissionPayload(row.payloadJson),
    tags: tagsBySourceId.get(row.sourceId) ?? [],
    pipelineRuns,
  };
}

export async function getObservedFieldNames(database: FormanDatabase, sourceId: string) {
  const rows = await database
    .select({ payloadJson: submissions.payloadJson })
    .from(submissions)
    .where(eq(submissions.sourceId, sourceId))
    .all();
  return [...new Set(rows.flatMap((row) => Object.keys(parseStoredSubmissionPayload(row.payloadJson))))].sort();
}

export async function countSubmissionsForSource(database: FormanDatabase, sourceId: string) {
  const row = await database
    .select({ value: count() })
    .from(submissions)
    .where(eq(submissions.sourceId, sourceId))
    .get();
  return row?.value ?? 0;
}

export async function deleteSubmission(database: FormanDatabase, id: string) {
  return deleteSubmissionsWhere(database, eq(submissions.id, id)) === 1;
}

export async function deleteSubmissions(database: FormanDatabase, ids: string[]) {
  if (ids.length === 0) return 0;

  return deleteSubmissionsWhere(database, sql`${submissions.id} in (select value from json_each(${JSON.stringify(ids)}))`);
}

export async function deleteMatchingSubmissions(database: FormanDatabase, query: SubmissionQuery) {
  const tagCondition = submissionTagCondition(database, query.tagIds);
  const conditions = submissionConditions({ ...query, tagCondition });
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return deleteSubmissionsWhere(database, where);
}

/** One short transaction per request; callers repeat while hasMore is true. */
export async function deleteMatchingSubmissionBatch(database: FormanDatabase, query: SubmissionQuery) {
  const conditions = submissionConditions({ ...query, tagCondition: submissionTagCondition(database, query.tagIds) });
  const where = and(...conditions);
  return database.transaction((transaction) => {
    const rows = transaction.select({ id: submissions.id }).from(submissions)
      .where(where).orderBy(submissions.createdAt, submissions.id).limit(101).all();
    const ids = rows.slice(0, 100).map(row => row.id);
    const deleted = ids.length ? deleteSubmissionsWhere(transaction, inArray(submissions.id, ids)) : 0;
    return { deleted, hasMore: rows.length > 100 };
  });
}
