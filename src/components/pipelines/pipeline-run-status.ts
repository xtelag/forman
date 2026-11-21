type PipelineRunStatus = "pending" | "processing" | "completed" | "completed_attention" | "cancelled";

type ActionRunStatus = "pending" | "processing" | "waiting_callback" | "retry_scheduled" | "completed" | "skipped_condition" | "not_run" | "failed" | "bypassed" | "cancelled";

export function isActivePipelineRun(status: PipelineRunStatus) {
  return status === "pending" || status === "processing";
}

export function hasActivePipelineRuns(runs: Array<{ status: PipelineRunStatus }>) {
  return runs.some((run) => isActivePipelineRun(run.status));
}

export function hasActiveActionRuns(actions: Array<{ status: ActionRunStatus }>) {
  return actions.some((action) => action.status === "pending" || action.status === "processing" || action.status === "retry_scheduled" || action.status === "waiting_callback");
}
