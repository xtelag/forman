import { and, asc, eq } from "drizzle-orm";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { emailConfirmationSessionActions, emailConfirmationSessions, pipelineRuns, pipelineActionRuns } from "@/server/db/schema";
import { parseStoredSubmissionPayload } from "@/shared/contracts/submission";
import { listPipelineRunSummaries, type PipelineRunSummary, type PipelineRunFilters } from "./pipeline-run-query-service";
import { safeWebhookErrorSummary } from "./webhook-errors";

type Database = ReturnType<typeof createDatabase>["db"];

const pipelineRunStatuses: PipelineRunSummary["status"][] = ["pending", "processing", "completed", "completed_attention", "cancelled"];

function pipelineRunFilters(request: Request): PipelineRunFilters {
  const query = new URL(request.url).searchParams;
  const status = query.get("status");
  return {
    actionStatus: query.get("actionStatus") === "failed_24h" ? "failed_24h" : query.get("actionStatus") === "failed" ? "failed" : undefined,
    page: Number(query.get("page")),
    size: Number(query.get("size")),
    from: query.get("from") || undefined,
    pipelineId: query.get("pipelineId") || undefined,
    search: query.get("search")?.trim() || undefined,
    sourceId: query.get("sourceId") || undefined,
    status: status && pipelineRunStatuses.includes(status as PipelineRunSummary["status"]) ? status as PipelineRunSummary["status"] : undefined,
    tagIds: query.getAll("tagId").filter(Boolean),
    to: query.get("to") || undefined,
  };
}

function safeActionErrorSummary(action: { errorSummary: string | null; type: string }) {
  if (!action.errorSummary) return null;
  if (action.errorSummary === "Callback expired") return "Callback expired.";
  if (action.type === "callback" || action.type === "callback_boolean") return "Callback request failed.";
  if (action.type === "email_confirmation") {
    // Runs stored before the terminology change keep the old wording in the database.
    if (action.errorSummary === "A confirmation email has already been sent for this Data Source and Data Pipeline.") return "A confirmation email has already been sent for this Source and Pipeline.";
    if (action.errorSummary === "Confirmation email sent." || action.errorSummary === "A confirmation email has already been sent for this Source and Pipeline." || action.errorSummary === "Confirmation link expired.") return action.errorSummary;
    return "Email Confirmation failed.";
  }
  if (action.type === "couchdb") return "CouchDB archive failed. Check the target connection, permissions and document conflicts.";
  if (action.type === "email") return "E-mail Action failed.";
  if (action.type === "webhook") return safeWebhookErrorSummary(action.errorSummary);
  return "Action failed.";
}

export function createAdminPipelineRunsHandler({ database }: { database: Database }) {
  async function getRunResponse(runId: string, request: Request, submissionId?: string) {
    if (!await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const run = await database.select().from(pipelineRuns).where(submissionId
      ? and(eq(pipelineRuns.id, runId), eq(pipelineRuns.submissionId, submissionId))
      : eq(pipelineRuns.id, runId)).get();
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    const actions = await database.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.runId, run.id)).orderBy(asc(pipelineActionRuns.position)).all();
    const confirmationExpiryByAction = new Map((await database.select({ actionRunId: emailConfirmationSessionActions.actionRunId, expiresAt: emailConfirmationSessions.expiresAt })
      .from(emailConfirmationSessionActions)
      .innerJoin(emailConfirmationSessions, eq(emailConfirmationSessionActions.sessionId, emailConfirmationSessions.id))
      .where(eq(emailConfirmationSessions.status, "waiting"))
      .all()).map((session) => [session.actionRunId, session.expiresAt]));
    return Response.json({
      actions: actions.map((action) => ({
        attemptCount: action.attemptCount,
        callbackExpiresAt: (action.type === "email_confirmation" ? confirmationExpiryByAction.get(action.id) : action.callbackExpiresAt)?.toISOString() ?? null,
        errorSummary: safeActionErrorSummary(action),
        id: action.id,
        inputPayload: parseStoredSubmissionPayload(action.inputPayloadJson),
        maximumAttempts: action.maximumAttempts,
        name: action.name,
        nextAttemptAt: action.nextAttemptAt?.toISOString() ?? null,
        outputPayload: action.outputPayloadJson ? parseStoredSubmissionPayload(action.outputPayloadJson) : null,
        position: action.position,
        status: action.status,
        type: action.type,
        updatedAt: action.updatedAt.toISOString(),
      })),
      createdAt: run.createdAt.toISOString(),
      pipelineId: run.pipelineId,
      pipelineName: run.pipelineName,
      id: run.id,
      status: run.status,
      submissionId: run.submissionId,
      updatedAt: run.updatedAt.toISOString(),
    });
  }

  return {
    async listAll(request: Request) {
      if (!await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const result = await listPipelineRunSummaries(database, pipelineRunFilters(request));
      return Response.json({ ...result, items: result.items.map((run) => ({
        ...run,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      })) });
    },
    async get(pipelineId: string, runId: string, request: Request) {
      if (!await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const run = await database.select({ id: pipelineRuns.id }).from(pipelineRuns).where(and(eq(pipelineRuns.pipelineId, pipelineId), eq(pipelineRuns.id, runId))).get();
      if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
      return getRunResponse(run.id, request);
    },
    getById(runId: string, request: Request) {
      return getRunResponse(runId, request);
    },
    getForSubmission(submissionId: string, runId: string, request: Request) {
      return getRunResponse(runId, request, submissionId);
    },
    async list(pipelineId: string, request: Request) {
      if (!await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const result = await listPipelineRunSummaries(database, { ...pipelineRunFilters(request), pipelineId });
      return Response.json({ ...result, items: result.items.map((run) => ({
        createdAt: run.createdAt.toISOString(), id: run.id, status: run.status, submissionId: run.submissionId,
        summary: `${run.completedActionCount} / ${run.actionCount}`,
      })) });
    },
    async retry(actionRunId: string, request: Request) {
      if (!await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const now = new Date();
      const retried = database.transaction((transaction) => {
        const action = transaction.select().from(pipelineActionRuns).where(and(eq(pipelineActionRuns.id, actionRunId), eq(pipelineActionRuns.status, "failed"))).get();
        if (!action) return false;
        const changed = transaction.update(pipelineActionRuns).set({ attemptCount: 0, callbackExpiresAt: null, callbackToken: null, errorSummary: null, nextAttemptAt: now, status: "pending", updatedAt: now }).where(and(eq(pipelineActionRuns.id, action.id), eq(pipelineActionRuns.status, "failed"))).run();
        if (changed.changes !== 1) return false;
        transaction.update(pipelineRuns).set({ status: "processing", updatedAt: now }).where(eq(pipelineRuns.id, action.runId)).run();
        return true;
      });
      return retried ? Response.json({ actionRunId }, { status: 202 }) : Response.json({ error: "Only failed Actions can be retried" }, { status: 409 });
    },
  };
}
