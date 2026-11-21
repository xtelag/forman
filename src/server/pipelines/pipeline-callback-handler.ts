import { and, eq, inArray } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { pipelineRuns, pipelineActionRuns } from "@/server/db/schema";
import { advancePipelineAction, stopRemainingPipelineActions } from "@/server/pipelines/pipeline-action-transitions";
import { submissionPayloadSchema, type SubmissionPayload } from "@/shared/contracts/submission";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type CallbackResult = { action: "cancel" } | { action: "continue"; payload: SubmissionPayload } | { action: "continue_boolean" };

function parseCallbackResult(value: unknown): CallbackResult | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (result.action === "cancel" && Object.keys(result).length === 1) return { action: "cancel" };
  if (result.action !== "continue" || Object.keys(result).length !== 2) return null;
  const payload = submissionPayloadSchema.safeParse(result.payload);
  return payload.success ? { action: "continue", payload: payload.data } : null;
}

function callbackBooleanField(configurationJson: string) {
  try {
    const field = (JSON.parse(configurationJson) as { field?: unknown }).field;
    return typeof field === "string" && field.trim() ? field : null;
  } catch {
    return null;
  }
}

export async function acceptPipelineCallback(database: FormanDatabase, token: string, request: Request) {
  const receivedAt = new Date();
  const waiting = database.select().from(pipelineActionRuns).where(and(eq(pipelineActionRuns.callbackToken, token), inArray(pipelineActionRuns.status, ["processing", "waiting_callback"]))).get();
  if (!waiting || !waiting.callbackExpiresAt || waiting.callbackExpiresAt <= receivedAt) return new Response(null, { status: 410 });
  let result: CallbackResult;
  if (waiting.type === "callback_boolean") {
    if (request.method !== "GET" && request.method !== "POST") return new Response(null, { status: 400 });
    result = { action: "continue_boolean" };
  } else {
    if (request.method !== "POST" || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response(null, { status: 400 });
    try {
      const parsed = parseCallbackResult(await request.json());
      if (!parsed) throw new Error();
      result = parsed;
    } catch {
      return new Response(null, { status: 400 });
    }
  }
  const now = new Date();
  const accepted = database.transaction((transaction) => {
    const action = transaction.select().from(pipelineActionRuns).where(and(eq(pipelineActionRuns.callbackToken, token), inArray(pipelineActionRuns.status, ["processing", "waiting_callback"]))).get();
    if (!action || !action.callbackExpiresAt || action.callbackExpiresAt <= now) return false;
    if (result.action === "cancel") {
      const consumed = transaction.update(pipelineActionRuns).set({ callbackExpiresAt: null, callbackToken: null, errorSummary: "Cancelled by Callback.", outputPayloadJson: null, status: "cancelled", updatedAt: now }).where(and(eq(pipelineActionRuns.id, action.id), eq(pipelineActionRuns.callbackToken, token), eq(pipelineActionRuns.status, action.status))).run();
      if (consumed.changes !== 1) return false;
      stopRemainingPipelineActions(transaction, action, now);
      transaction.update(pipelineRuns).set({ status: "cancelled", updatedAt: now }).where(eq(pipelineRuns.id, action.runId)).run();
      return true;
    }
    const input = JSON.parse(action.inputPayloadJson) as SubmissionPayload;
    let output: SubmissionPayload;
    if (result.action === "continue_boolean") {
      const field = callbackBooleanField(action.configurationJson);
      if (!field) return false;
      output = { ...input, [field]: true };
    } else output = { ...input, ...result.payload };
    const consumed = transaction.update(pipelineActionRuns).set({ callbackExpiresAt: null, callbackToken: null, errorSummary: null, nextAttemptAt: null, outputPayloadJson: JSON.stringify(output), status: "completed", updatedAt: now }).where(and(eq(pipelineActionRuns.id, action.id), eq(pipelineActionRuns.callbackToken, token), eq(pipelineActionRuns.status, action.status))).run();
    if (consumed.changes !== 1) return false;
    advancePipelineAction(transaction, action, output, now);
    return true;
  });
  return new Response(null, { status: accepted ? 204 : 410 });
}
