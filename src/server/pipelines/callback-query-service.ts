import { parsePageSize as normalizePageSize } from "@/shared/pagination";
import { parseDateInput } from "@/shared/format/date";
import { and, eq, exists, inArray, isNotNull, lte, or } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { emailConfirmationSessionActions, emailConfirmationSessions, pipelineActionRuns, pipelineRuns, sourceTags, sources } from "@/server/db/schema";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export type WaitingCallback = {
  actionName: string;
  actionType: "callback" | "callback_boolean" | "email_confirmation";
  callbackExpiresAt: Date;
  id: string;
  pipelineId: string | null;
  pipelineName: string;
  runId: string;
  sourceId: string;
  sourceName: string;
  waitingSince: Date;
};

export type WaitingCallbackFilters = {
  search?: string;
  olderThanMinutes?: number;
  from?: string;
  page?: number;
  pipelineId?: string;
  size?: 10 | 50 | 100;
  sourceId?: string;
  tagIds?: string[];
  to?: string;
};


export function waitingCallbackCondition(database: FormanDatabase, olderThan?: Date) {
  return and(
    eq(pipelineActionRuns.status, "waiting_callback"),
    olderThan ? lte(pipelineActionRuns.updatedAt, olderThan) : undefined,
    or(
      and(inArray(pipelineActionRuns.type, ["callback", "callback_boolean"]), isNotNull(pipelineActionRuns.callbackExpiresAt)),
      and(eq(pipelineActionRuns.type, "email_confirmation"), exists(database.select({ id: emailConfirmationSessionActions.actionRunId })
        .from(emailConfirmationSessionActions)
        .innerJoin(emailConfirmationSessions, eq(emailConfirmationSessionActions.sessionId, emailConfirmationSessions.id))
        .where(and(eq(emailConfirmationSessionActions.actionRunId, pipelineActionRuns.id), eq(emailConfirmationSessions.status, "waiting"))))),
    ),
  );
}

export async function listWaitingCallbacks(database: FormanDatabase, filters: WaitingCallbackFilters = {}, now = new Date()) {
  const actions = await database
    .select()
    .from(pipelineActionRuns)
    .where(waitingCallbackCondition(database, filters.olderThanMinutes ? new Date(now.getTime() - filters.olderThanMinutes * 60_000) : undefined))
    .all();
  if (actions.length === 0) return { items: [] as WaitingCallback[], total: 0 };

  const confirmationExpiryByAction = new Map((await database.select({ actionRunId: emailConfirmationSessionActions.actionRunId, expiresAt: emailConfirmationSessions.expiresAt })
    .from(emailConfirmationSessionActions)
    .innerJoin(emailConfirmationSessions, eq(emailConfirmationSessionActions.sessionId, emailConfirmationSessions.id))
    .where(eq(emailConfirmationSessions.status, "waiting"))
    .all()).map((session) => [session.actionRunId, session.expiresAt]));
  const runs = await database.select().from(pipelineRuns).where(inArray(pipelineRuns.id, actions.map((action) => action.runId))).all();
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const sourceRows = await database.select({ id: sources.id, name: sources.name }).from(sources).where(inArray(sources.id, [...new Set(runs.map((run) => run.sourceId))])).all();
  const sourceNames = new Map(sourceRows.map((source) => [source.id, source.name]));
  const sourceIdsForTags = filters.tagIds?.length
    ? new Set((await database.select({ sourceId: sourceTags.sourceId }).from(sourceTags).where(inArray(sourceTags.tagId, filters.tagIds)).all()).map((row) => row.sourceId))
    : null;
  const from = parseDateInput(filters.from);
  const to = parseDateInput(filters.to, true);
  const matching = actions.flatMap((action) => {
    const run = runsById.get(action.runId);
    const expiresAt = action.type === "email_confirmation" ? confirmationExpiryByAction.get(action.id) : action.callbackExpiresAt;
    if (!run || !expiresAt || (action.type !== "callback" && action.type !== "callback_boolean" && action.type !== "email_confirmation")) return [];
    if (filters.search && !(action.name + " " + run.pipelineName + " " + (sourceNames.get(run.sourceId) ?? "") + " " + action.id).toLocaleLowerCase().includes(filters.search.toLocaleLowerCase())) return [];
    if (filters.sourceId && run.sourceId !== filters.sourceId) return [];
    if (filters.pipelineId && run.pipelineId !== filters.pipelineId) return [];
    if (sourceIdsForTags && !sourceIdsForTags.has(run.sourceId)) return [];
    if (from && action.updatedAt < from) return [];
    if (to && action.updatedAt >= to) return [];
    return [{
      actionName: action.name,
      actionType: action.type,
      callbackExpiresAt: expiresAt,
      id: action.id,
      pipelineId: run.pipelineId,
      pipelineName: run.pipelineName,
      runId: run.id,
      sourceId: run.sourceId,
      sourceName: sourceNames.get(run.sourceId) ?? "Deleted source",
      waitingSince: action.updatedAt,
    }];
  }).sort((left, right) => left.callbackExpiresAt.getTime() - right.callbackExpiresAt.getTime() || left.waitingSince.getTime() - right.waitingSince.getTime());
  const total = matching.length;
  const size = normalizePageSize(filters.size);
  const page = Math.max(1, filters.page ?? 1);
  return { items: matching.slice((page - 1) * size, page * size), total };
}
