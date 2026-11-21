import { localDateParameters } from "@/client/local-date-filters";
import { adminRequest } from "./client";
import type { StoredSubmissionPayload } from "@/shared/contracts/submission";
import type { AdminTag } from "@/shared/contracts/admin";

export type AdminPipeline = {
  enabled: boolean;
  id: string;
  name: string;
  sourceId: string;
  sourceName: string;
  sourcePublicId: string;
  tags: AdminTag[];
  steps: Array<{
    enabled: boolean;
    id: string;
    name: string;
    position: number;
    type: "transformation" | "webhook" | "callback" | "callback_boolean" | "email" | "email_confirmation" | "inbox" | "couchdb";
  }>;
};

export type AdminPipelineDetail = Omit<AdminPipeline, "steps"> & {
  steps: Array<AdminPipeline["steps"][number] & {
    blocking: boolean;
    condition: PipelineActionInput["condition"];
    conditionMissBehavior: NonNullable<PipelineActionInput["conditionMissBehavior"]>;
    configuration: PipelineActionInput["configuration"] & { bearerTokenConfigured?: boolean; passwordConfigured?: boolean };
    failurePolicy: "bypass" | "cancel" | null;
    maximumAttempts: number;
  }>;
};

export type PipelineActionInput = {
  blocking?: boolean;
  configuration?:
    | { url: string; database: string; username: string; password?: string }
    | { expression: string }
    | { url: string; method?: "POST" | "PUT" | "PATCH" | "DELETE" | "GET" | "HEAD"; authentication?: "none" | "bearer" | "basic"; bearerToken?: string; username?: string; password?: string }
    | { url: string; timeoutSeconds: number }
    | { field: string; url: string; timeoutSeconds: number }
    | { recipients: string[] }
    | {
        booleanField: string;
        completedText: string;
        confirmationCtaLabel: string;
        confirmationText: string;
        emailCtaLabel: string;
        emailField: string;
        emailText: string;
        subject: string;
        timeoutHours: number;
      }
    | Record<string, never>;
  condition?: {
    conditions: Array<{
      field: string;
      operator: "equals" | "notEquals" | "contains" | "notContains" | "exists" | "isEmpty";
      value?: string;
    }>;
    mode: "all" | "any";
  } | null;
  conditionMissBehavior?: "skip_action" | "skip_remaining";
  enabled?: boolean;
  failurePolicy?: "bypass" | "cancel";
  id?: string;
  maximumAttempts?: number;
  name: string;
  type: "transformation" | "webhook" | "callback" | "callback_boolean" | "email" | "email_confirmation" | "inbox" | "couchdb";
};

export type CreatePipelineInput = {
  enabled?: boolean;
  name: string;
  sourceId: string;
  steps: PipelineActionInput[];
};

export type PipelineConfigurationInput = {
  enabled?: boolean;
  name: string;
  sourceId: string;
};

export function listPipelines() {
  return adminRequest<{ items: AdminPipeline[] }>(
    "/api/admin/v1/pipelines",
  ).then((response) => response.items);
}

export function createPipeline(
  values: CreatePipelineInput,
) {
  return adminRequest<AdminPipeline>("/api/admin/v1/pipelines", {
    body: JSON.stringify(values),
    method: "POST",
  });
}

export function createPipelineConfiguration(values: PipelineConfigurationInput) {
  return adminRequest<AdminPipelineDetail>("/api/admin/v1/pipelines", {
    body: JSON.stringify(values),
    method: "POST",
  });
}

export function deletePipeline(id: string) {
  return adminRequest<void>(
    `/api/admin/v1/pipelines/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function getPipeline(id: string) {
  return adminRequest<AdminPipelineDetail>(
    `/api/admin/v1/pipelines/${encodeURIComponent(id)}`,
  );
}

export function updatePipeline(
  id: string,
  values: CreatePipelineInput,
) {
  return adminRequest<AdminPipeline>(
    `/api/admin/v1/pipelines/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(values),
      method: "PUT",
    },
  );
}

export function updatePipelineConfiguration(id: string, values: Partial<Pick<PipelineConfigurationInput, "enabled" | "name">>) {
  return adminRequest<AdminPipelineDetail>(`/api/admin/v1/pipelines/${encodeURIComponent(id)}`, {
    body: JSON.stringify(values),
    method: "PATCH",
  });
}

function actionPath(pipelineId: string, actionId?: string) {
  const path = `/api/admin/v1/pipelines/${encodeURIComponent(pipelineId)}/actions`;
  return actionId ? `${path}/${encodeURIComponent(actionId)}` : path;
}

export function createPipelineAction(pipelineId: string, values: PipelineActionInput) {
  return adminRequest<AdminPipelineDetail>(actionPath(pipelineId), { body: JSON.stringify(values), method: "POST" });
}

export function updatePipelineAction(pipelineId: string, actionId: string, values: PipelineActionInput) {
  return adminRequest<AdminPipelineDetail>(actionPath(pipelineId, actionId), { body: JSON.stringify(values), method: "PATCH" });
}

export function deletePipelineAction(pipelineId: string, actionId: string) {
  return adminRequest<AdminPipelineDetail>(actionPath(pipelineId, actionId), { method: "DELETE" });
}

export function movePipelineAction(pipelineId: string, actionId: string, direction: "down" | "up") {
  return adminRequest<AdminPipelineDetail>(`${actionPath(pipelineId, actionId)}/move`, {
    body: JSON.stringify({ direction }), method: "POST",
  });
}

export type AdminPipelineRun = {
  submissionId?: string;
  createdAt: string;
  id: string;
  status: "pending" | "processing" | "completed" | "completed_attention" | "cancelled";
  summary: string;
};

export type AdminGlobalPipelineRun = Omit<AdminPipelineRun, "summary"> & {
  actionCount: number;
  completedActionCount: number;
  failedActionCount: number;
  pipelineId: string | null;
  pipelineName: string;
  processingActionCount: number;
  skippedConditionCount: number;
  sourceId: string;
  sourceName: string;
  submissionId: string;
  updatedAt: string;
};

export type PipelineRunPage<T> = { items: T[]; page: number; pageSize: 10 | 50 | 100; total: number };

export type PipelineRunQuery = {
  search?: string;
  actionStatus?: "failed" | "failed_24h";
  page?: number;
  size?: 10 | 50 | 100;
  from?: string;
  pipelineId?: string;
  sourceId?: string;
  status?: AdminGlobalPipelineRun["status"];
  tagIds?: string[];
  to?: string;
};

export type AdminWaitingCallback = {
  actionName: string;
  actionType: "callback" | "callback_boolean" | "email_confirmation";
  callbackExpiresAt: string;
  id: string;
  pipelineId: string | null;
  pipelineName: string;
  runId: string;
  sourceId: string;
  sourceName: string;
  waitingSince: string;
};

export type CallbackQuery = {
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

export function listWaitingCallbacks(query: CallbackQuery = {}) {
  const parameters = new URLSearchParams();
  if (query.olderThanMinutes) parameters.set("olderThanMinutes", String(query.olderThanMinutes));
  if (query.search) parameters.set("search", query.search);
  if (query.sourceId) parameters.set("sourceId", query.sourceId);
  if (query.pipelineId) parameters.set("pipelineId", query.pipelineId);
  if (query.from) parameters.set("from", query.from);
  if (query.to) parameters.set("to", query.to);
  if (query.page && query.page > 1) parameters.set("page", String(query.page));
  if (query.size && query.size !== 10) parameters.set("size", String(query.size));
  for (const tagId of query.tagIds ?? []) parameters.append("tagId", tagId);
  const suffix = localDateParameters(parameters).toString();
  return adminRequest<{ items: AdminWaitingCallback[]; total: number }>(`/api/admin/v1/callbacks${suffix ? `?${suffix}` : ""}`);
}

function pipelineRunSearch(query: PipelineRunQuery) {
  const parameters = new URLSearchParams();
  if (query.actionStatus) parameters.set("actionStatus", query.actionStatus);
  if (query.search) parameters.set("search", query.search);
  if (query.sourceId) parameters.set("sourceId", query.sourceId);
  if (query.pipelineId) parameters.set("pipelineId", query.pipelineId);
  if (query.status) parameters.set("status", query.status);
  if (query.from) parameters.set("from", query.from);
  if (query.to) parameters.set("to", query.to);
  if (query.page && query.page > 1) parameters.set("page", String(query.page));
  if (query.size && query.size !== 10) parameters.set("size", String(query.size));
  for (const tagId of query.tagIds ?? []) parameters.append("tagId", tagId);
  const suffix = localDateParameters(parameters).toString();
  return suffix ? `?${suffix}` : "";
}

export function listGlobalPipelineRuns(query: PipelineRunQuery = {}) {
  return adminRequest<PipelineRunPage<AdminGlobalPipelineRun>>(`/api/admin/v1/pipeline-runs${pipelineRunSearch(query)}`);
}

export type AdminPipelineRunDetail = Omit<AdminPipelineRun, "summary"> & {
  /** Null once the Pipeline was deleted; the Run keeps its snapshot. */
  pipelineId?: string | null;
  pipelineName: string;
  submissionId?: string;
  updatedAt: string;
  actions: Array<{
    attemptCount: number;
    callbackExpiresAt: string | null;
    errorSummary: string | null;
    id: string;
    inputPayload: StoredSubmissionPayload;
    maximumAttempts: number;
    name: string;
    nextAttemptAt: string | null;
    outputPayload: StoredSubmissionPayload | null;
    position: number;
    status: "pending" | "processing" | "waiting_callback" | "retry_scheduled" | "completed" | "skipped_condition" | "not_run" | "failed" | "bypassed" | "cancelled";
    type: "transformation" | "webhook" | "callback" | "callback_boolean" | "email" | "email_confirmation" | "inbox" | "couchdb";
    updatedAt: string;
  }>;
};

export function listPipelineRuns(id: string, query: PipelineRunQuery = {}) {
  return adminRequest<PipelineRunPage<AdminPipelineRun>>(
    `/api/admin/v1/pipelines/${encodeURIComponent(id)}/runs${pipelineRunSearch(query)}`,
  );
}

export function getPipelineRun(pipelineId: string, runId: string) {
  return adminRequest<AdminPipelineRunDetail>(
    `/api/admin/v1/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(runId)}`,
  );
}

export function getPipelineRunById(runId: string) {
  return adminRequest<AdminPipelineRunDetail>(
    `/api/admin/v1/pipeline-runs/${encodeURIComponent(runId)}`,
  );
}

export function getPipelineRunForSubmission(submissionId: string, runId: string) {
  return adminRequest<AdminPipelineRunDetail>(
    `/api/admin/v1/submissions/${encodeURIComponent(submissionId)}/pipeline-runs/${encodeURIComponent(runId)}`,
  );
}

export function retryPipelineAction(actionRunId: string) {
  return adminRequest<{ actionRunId: string }>(
    `/api/admin/v1/pipelines/runs/${encodeURIComponent(actionRunId)}/retry`,
    { method: "POST" },
  );
}
