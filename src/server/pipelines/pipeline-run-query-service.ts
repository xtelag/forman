import { parsePageSize as normalizePageSize } from "@/shared/pagination";
import { parseDateInput } from "@/shared/format/date";
import { and, count, desc, eq, exists, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { pipelineActionRuns, pipelineRuns, sourceTags, sources } from "@/server/db/schema";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export type PipelineRunSummary = {
  actionCount: number;
  completedActionCount: number;
  createdAt: Date;
  failedActionCount: number;
  id: string;
  pipelineId: string | null;
  pipelineName: string;
  processingActionCount: number;
  skippedConditionCount: number;
  sourceId: string;
  sourceName: string;
  status: "pending" | "processing" | "completed" | "completed_attention" | "cancelled";
  submissionId: string;
  updatedAt: Date;
};

export type PipelineRunFilters = {
  search?: string;
  actionStatus?: "failed" | "failed_24h";
  page?: number;
  size?: number;
  from?: string;
  pipelineId?: string;
  sourceId?: string;
  status?: PipelineRunSummary["status"];
  tagIds?: string[];
  to?: string;
};


// Collection queries never select immutable snapshots or Action payload/configuration.
const runFields = {
  createdAt: pipelineRuns.createdAt,
  id: pipelineRuns.id,
  pipelineId: pipelineRuns.pipelineId,
  pipelineName: pipelineRuns.pipelineName,
  sourceId: pipelineRuns.sourceId,
  sourceName: sql<string>`coalesce(${sources.name}, 'Deleted source')`,
  status: pipelineRuns.status,
  submissionId: pipelineRuns.submissionId,
  updatedAt: pipelineRuns.updatedAt,
};

function summarizePipelineRuns(
  database: Pick<FormanDatabase, "select">,
  runs: Array<Omit<PipelineRunSummary, "actionCount" | "completedActionCount" | "failedActionCount" | "processingActionCount" | "skippedConditionCount">>,
  scope: SQL,
): PipelineRunSummary[] {
  if (runs.length === 0) return [];
  const counts = database.select({
    runId: pipelineActionRuns.runId,
    actionCount: count(),
    completedActionCount: sql<number>`sum(case when ${pipelineActionRuns.status} = 'completed' then 1 else 0 end)`,
    failedActionCount: sql<number>`sum(case when ${pipelineActionRuns.status} = 'failed' then 1 else 0 end)`,
    processingActionCount: sql<number>`sum(case when ${pipelineActionRuns.status} in ('pending', 'processing', 'waiting_callback', 'retry_scheduled') then 1 else 0 end)`,
    skippedConditionCount: sql<number>`sum(case when ${pipelineActionRuns.status} = 'skipped_condition' then 1 else 0 end)`,
  }).from(pipelineActionRuns).where(scope).groupBy(pipelineActionRuns.runId).all();
  const byRun = new Map(counts.map(({ runId, ...summary }) => [runId, summary]));
  return runs.map((run) => ({ ...run, ...(byRun.get(run.id) ?? {
    actionCount: 0, completedActionCount: 0, failedActionCount: 0, processingActionCount: 0, skippedConditionCount: 0,
  }) }));
}

export function failedActionCondition(now: Date, last24Hours = false) {
  return and(
    eq(pipelineActionRuns.status, "failed"),
    last24Hours ? gte(pipelineActionRuns.updatedAt, new Date(now.getTime() - 24 * 60 * 60 * 1_000)) : undefined,
    last24Hours ? lte(pipelineActionRuns.updatedAt, now) : undefined,
  );
}

export async function listPipelineRunSummaries(database: FormanDatabase, filters: PipelineRunFilters = {}, now = new Date()) {
  const from = parseDateInput(filters.from, false);
  const to = parseDateInput(filters.to, true);
  const where = and(
    filters.search ? sql`instr(lower(${pipelineRuns.pipelineName} || ' ' || ${pipelineRuns.id} || ' ' || coalesce((select ${sources.name} from ${sources} where ${sources.id} = ${pipelineRuns.sourceId}), '')), lower(${filters.search})) > 0` : undefined,
    filters.sourceId ? eq(pipelineRuns.sourceId, filters.sourceId) : undefined,
    filters.pipelineId ? eq(pipelineRuns.pipelineId, filters.pipelineId) : undefined,
    filters.status ? eq(pipelineRuns.status, filters.status) : undefined,
    from ? gte(pipelineRuns.createdAt, from) : undefined,
    to ? lt(pipelineRuns.createdAt, to) : undefined,
    filters.tagIds?.length ? exists(database.select({ id: sourceTags.sourceId }).from(sourceTags).where(and(eq(sourceTags.sourceId, pipelineRuns.sourceId), inArray(sourceTags.tagId, filters.tagIds)))) : undefined,
    filters.actionStatus ? exists(database.select({ id: pipelineActionRuns.id }).from(pipelineActionRuns).where(and(eq(pipelineActionRuns.runId, pipelineRuns.id), failedActionCondition(now, filters.actionStatus === "failed_24h")))) : undefined,
  );
  const pageSize: 10 | 50 | 100 = normalizePageSize(filters.size);
  const requestedPage = Number.isSafeInteger(filters.page) && filters.page! > 0 ? filters.page! : 1;
  return database.transaction((transaction) => {
    const total = transaction.select({ total: count() }).from(pipelineRuns).where(where).get()!.total;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const runs = transaction.select(runFields).from(pipelineRuns).leftJoin(sources, eq(sources.id, pipelineRuns.sourceId))
      .where(where).orderBy(desc(pipelineRuns.createdAt), desc(pipelineRuns.id)).limit(pageSize).offset((page - 1) * pageSize).all();
    return { items: summarizePipelineRuns(transaction, runs, inArray(pipelineActionRuns.runId, runs.map((run) => run.id))), page, pageSize, total };
  });
}

export async function listPipelineRunSummariesForSubmission(database: FormanDatabase, submissionId: string): Promise<PipelineRunSummary[]> {
  return database.transaction((transaction) => {
    const where = eq(pipelineRuns.submissionId, submissionId);
    const runs = transaction.select(runFields).from(pipelineRuns).leftJoin(sources, eq(sources.id, pipelineRuns.sourceId))
      .where(where).orderBy(desc(pipelineRuns.createdAt), desc(pipelineRuns.id)).all();
    return summarizePipelineRuns(transaction, runs, inArray(pipelineActionRuns.runId, transaction.select({ id: pipelineRuns.id }).from(pipelineRuns).where(where)));
  });
}
