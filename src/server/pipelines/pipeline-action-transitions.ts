import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { createDatabase } from "@/server/db/client";
import { pipelineActionRuns, pipelineRuns } from "@/server/db/schema";
import { parseStoredSubmissionPayload, type SubmissionPayload } from "@/shared/contracts/submission";

type Database = ReturnType<typeof createDatabase>["db"];
type Writer = Pick<Database, "select" | "update">;
type TransactionDatabase = Pick<Database, "transaction">;
export type ActionRun = typeof pipelineActionRuns.$inferSelect;

export function actionPayload(action: ActionRun) {
  return parseStoredSubmissionPayload(action.inputPayloadJson);
}

export function refreshPipelineStatus(database: Writer, runId: string, now: Date) {
  const actions = database.select({ status: pipelineActionRuns.status, blocking: pipelineActionRuns.blocking })
    .from(pipelineActionRuns).where(eq(pipelineActionRuns.runId, runId)).all();
  const active = actions.some((action) => ["pending", "processing", "waiting_callback", "retry_scheduled"].includes(action.status));
  const cancelled = actions.some((action) => action.status === "cancelled" || (action.status === "failed" && action.blocking));
  const attention = actions.some((action) => action.status === "failed");
  database.update(pipelineRuns).set({ status: cancelled ? "cancelled" : active ? "processing" : attention ? "completed_attention" : "completed", updatedAt: now })
    .where(eq(pipelineRuns.id, runId)).run();
}

export function advancePipelineAction(database: Writer, action: ActionRun, output: SubmissionPayload, now: Date) {
  const next = database.select().from(pipelineActionRuns).where(and(
    eq(pipelineActionRuns.runId, action.runId), gt(pipelineActionRuns.position, action.position),
  )).orderBy(asc(pipelineActionRuns.position)).limit(1).get();
  // Retrying an earlier non-blocking failure must preserve downstream audit and side effects.
  if (next?.status === "not_run") {
    database.update(pipelineActionRuns).set({ inputPayloadJson: JSON.stringify(output), nextAttemptAt: now, status: "pending", updatedAt: now })
      .where(and(eq(pipelineActionRuns.id, next.id), eq(pipelineActionRuns.status, "not_run"))).run();
  }
  refreshPipelineStatus(database, action.runId, now);
}

export function completePipelineAction(database: TransactionDatabase, action: ActionRun, output: SubmissionPayload, now: Date, status: "completed" | "skipped_condition" = "completed") {
  return database.transaction((transaction) => {
    const changed = transaction.update(pipelineActionRuns).set({ outputPayloadJson: JSON.stringify(output), errorSummary: null, callbackToken: null, callbackExpiresAt: null, nextAttemptAt: null, status, updatedAt: now })
      .where(and(eq(pipelineActionRuns.id, action.id), eq(pipelineActionRuns.status, action.status), eq(pipelineActionRuns.attemptCount, action.attemptCount))).run();
    if (changed.changes !== 1) return false;
    advancePipelineAction(transaction, action, output, now);
    return true;
  });
}

export function failPipelineAction(database: TransactionDatabase, action: ActionRun, summary: string, now: Date, options: { terminal?: boolean } = {}) {
  return database.transaction((transaction) => {
    const terminal = options.terminal || action.attemptCount >= action.maximumAttempts;
    const bypass = terminal && action.blocking && action.failurePolicy === "bypass";
    const changed = transaction.update(pipelineActionRuns).set({
      callbackToken: null, callbackExpiresAt: null, errorSummary: summary,
      nextAttemptAt: terminal ? null : new Date(now.getTime() + Math.min(300_000, 5_000 * 2 ** Math.max(0, action.attemptCount - 1))),
      outputPayloadJson: bypass ? action.inputPayloadJson : null,
      status: terminal ? bypass ? "bypassed" : "failed" : "retry_scheduled", updatedAt: now,
    }).where(and(eq(pipelineActionRuns.id, action.id), eq(pipelineActionRuns.status, action.status), eq(pipelineActionRuns.attemptCount, action.attemptCount))).run();
    if (changed.changes !== 1) return false;
    if (terminal && (!action.blocking || bypass)) advancePipelineAction(transaction, action, actionPayload(action), now);
    else refreshPipelineStatus(transaction, action.runId, now);
    return true;
  });
}

export function stopRemainingPipelineActions(database: Writer, action: ActionRun, now: Date) {
  database.update(pipelineActionRuns).set({ status: "not_run", nextAttemptAt: null, updatedAt: now }).where(and(
    eq(pipelineActionRuns.runId, action.runId), gt(pipelineActionRuns.position, action.position),
    inArray(pipelineActionRuns.status, ["not_run", "pending"]),
  )).run();
}
