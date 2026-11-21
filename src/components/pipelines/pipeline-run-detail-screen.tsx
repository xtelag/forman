"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getPipelineRun,
  getPipelineRunById,
  getPipelineRunForSubmission,
  retryPipelineAction,
  type AdminPipelineRunDetail,
} from "@/client/admin-api/pipelines";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { RowNavigationItems } from "@/components/patterns/row-navigation-items";
import { ActionSummary } from "./action-summary";
import { ActionRunPayload } from "./action-run-payload";
import {
  hasActiveActionRuns,
  isActivePipelineRun,
} from "./pipeline-run-status";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  EditorAccordion,
  EditorSection,
} from "@/components/patterns/editor-accordion";
import { LocalDateTime } from "@/components/patterns/local-date-time";
import { useAccordionState } from "@/hooks/use-accordion-state";
type RunAction = AdminPipelineRunDetail["actions"][number];

const actionStatusLabel: Record<RunAction["status"], string> = {
  bypassed: "Bypassed",
  cancelled: "Cancelled",
  completed: "Completed",
  failed: "Failed",
  not_run: "Not run",
  pending: "Pending",
  processing: "Processing",
  retry_scheduled: "Retry scheduled",
  skipped_condition: "Skipped on condition",
  waiting_callback: "Waiting for Callback",
};

function actionStatusTone(status: RunAction["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "error" as const;
  if (
    status === "bypassed" ||
    status === "cancelled" ||
    status === "not_run" ||
    status === "skipped_condition"
  )
    return "inactive" as const;
  return "warning" as const;
}

function runStatusLabel(status: AdminPipelineRunDetail["status"]) {
  return {
    cancelled: "Cancelled",
    completed: "Completed",
    completed_attention: "Completed with attention",
    pending: "Pending",
    processing: "Processing",
  }[status];
}

function actionTypeLabel(type: RunAction["type"]) {
  return {
    couchdb: "CouchDB",
    callback: "Callback",
    callback_boolean: "Callback Touch",
    email: "Email",
    email_confirmation: "Email Confirmation",
    inbox: "Inbox",
    transformation: "Transformation",
    webhook: "Webhook",
  }[type];
}

function actionAttemptSummary(action: RunAction) {
  if (action.status === "completed")
    return action.attemptCount > 0 ? `Attempt ${action.attemptCount}` : "";
  if (action.attemptCount === 0) return "Not attempted";
  return `${action.attemptCount} of ${action.maximumAttempts} attempts`;
}

function ActionRunItem({
  action,
  onRetry,
  retrying,
  retryDisabled,
  retryError,
}: {
  action: RunAction;
  onRetry: (id: string) => void;
  retrying: boolean;
  retryDisabled: boolean;
  retryError?: string;
}) {
  return (
    <Box component="li" miw={0}>
      <EditorSection
        value={action.id}
        title={action.position + ". " + action.name}
        header={<ActionSummary name={action.name} position={action.position}
          type={actionTypeLabel(action.type)} processing={actionAttemptSummary(action)}
          status={<StatusBadge status={actionStatusTone(action.status)}>
            {action.status === "waiting_callback" && action.type === "email_confirmation"
              ? "Waiting for confirmation" : actionStatusLabel[action.status]}
          </StatusBadge>} />}
      >
        <Stack gap="xs">
          {(action.status === "retry_scheduled" && action.nextAttemptAt) || action.callbackExpiresAt ? (
          <Group component="dl" gap="lg" m={0}>
            {action.status === "retry_scheduled" && action.nextAttemptAt ? (
              <Group gap="xs">
                <Text component="dt" size="sm" fw={500} c="dimmed">
                  Next retry
                </Text>
                <Text component="dd" size="sm" m={0}>
                  <LocalDateTime value={action.nextAttemptAt} />
                </Text>
              </Group>
            ) : null}
            {action.callbackExpiresAt ? (
              <Group gap="xs">
                <Text component="dt" size="sm" fw={500} c="dimmed">
                  {action.type === "email_confirmation"
                    ? "Confirmation expires"
                    : "Callback expires"}
                </Text>
                <Text component="dd" size="sm" m={0}>
                  <LocalDateTime value={action.callbackExpiresAt} />
                </Text>
              </Group>
            ) : null}
          </Group>
          ) : null}
          {action.errorSummary ? (
            <Alert
              color="red"
              role="alert"
              styles={{ message: { overflowWrap: "anywhere" } }}
            >
              {action.errorSummary}
            </Alert>
          ) : null}
          {retryError ? (
            <Alert color="red" role="alert">
              {retryError}
            </Alert>
          ) : null}
          {action.status === "failed" ? (
            <Group>
              <Button
                variant="default"
                type="button"
                leftSection={<RotateCcw size={16} />}
                disabled={retryDisabled}
                loading={retrying}
                onClick={() => onRetry(action.id)}
              >
                {retrying ? "Retrying…" : "Retry Action"}
              </Button>
            </Group>
          ) : null}
          <ActionRunPayload action={action} />
        </Stack>
      </EditorSection>
    </Box>
  );
}
type RunDetailProps = {
  context:
    | { kind: "global" }
    | { kind: "pipeline"; pipelineId: string }
    | { kind: "submission"; submissionId: string };
  loadRun?: (runId: string) => Promise<AdminPipelineRunDetail>;
  retryAction?: (actionRunId: string) => Promise<unknown>;
  runId: string;
};
export function PipelineRunDetailScreen(props: RunDetailProps) {
  return (
    <PipelineRunDetailContent
      key={JSON.stringify([props.context, props.runId])}
      {...props}
    />
  );
}
function PipelineRunDetailContent({
  context,
  loadRun,
  retryAction = retryPipelineAction,
  runId,
}: RunDetailProps) {
  const load =
    loadRun ??
    (context.kind === "pipeline"
      ? (id: string) => getPipelineRun(context.pipelineId, id)
      : context.kind === "submission"
        ? (id: string) => getPipelineRunForSubmission(context.submissionId, id)
        : getPipelineRunById);
  const resource = useAdminResource(
    () => load(runId),
    context.kind + ":" + runId,
    {
      active: (value) =>
        isActivePipelineRun(value.status) || hasActiveActionRuns(value.actions),
      policy: "operational",
    },
  );
  const [panels, setPanels] = useAccordionState(runId);
  const [retryingActionId, setRetryingActionId] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const backDestination =
    context.kind === "pipeline"
      ? {
          href:
            "/app/pipelines/" +
            encodeURIComponent(context.pipelineId) +
            "/runs",
          label: "Back to Pipeline Runs",
        }
      : context.kind === "submission"
        ? {
            href:
              "/app/submissions/" + encodeURIComponent(context.submissionId),
            label: "Back to Submission",
          }
        : { href: "/app/pipeline-runs", label: "Back to Pipeline Runs" };
  const run = resource.data;
  const header = (
    <PageHeader
      back={backDestination}
      documentTitle={run ? run.pipelineName + " · Pipeline Run" : undefined}
      title={run?.pipelineName ?? "Pipeline Run"}
      status={
        run ? (
          <StatusBadge
            status={
              run.status === "completed"
                ? "success"
                : run.status === "cancelled"
                  ? "error"
                  : "warning"
            }
          >
            {runStatusLabel(run.status)}
          </StatusBadge>
        ) : undefined
      }
      actions={run && (run.pipelineId || run.submissionId) ? (
        <RowActionsMenu detail label="Pipeline Run actions">
          <RowNavigationItems items={[
            Boolean(run.submissionId) && {label: "Open Submission", href: "/app/submissions/" + encodeURIComponent(run.submissionId!)},
            Boolean(run.pipelineId) && {label: "Open Pipeline", href: "/app/pipelines/" + encodeURIComponent(run.pipelineId!)},
          ]} />
        </RowActionsMenu>
      ) : undefined}
      description={
        <Group gap={6} wrap="wrap" style={{ overflowWrap: "anywhere" }}>
          {run ? <>
            <span>Started <LocalDateTime value={run.createdAt} /></span><span aria-hidden="true">·</span></> : null}
          <span>ID: {runId}</span>
        </Group>
      }
    />
  );
  async function retry(actionRunId: string) {
    if (retryingActionId) return;
    const request = ++generation.current;
    setRetryingActionId(actionRunId);
    setRetryErrors((current) => ({ ...current, [actionRunId]: "" }));
    try {
      await retryAction(actionRunId);
      if (request !== generation.current) return;
      await resource.refresh();
    } catch {
      if (request !== generation.current) return;
      setRetryErrors((current) => ({
        ...current,
        [actionRunId]:
          "Action could not be retried. It may have changed state.",
      }));
      setPanels((current) =>
        current.includes(actionRunId) ? current : [...current, actionRunId],
      );
    } finally {
      if (request === generation.current) setRetryingActionId(null);
    }
  }
  if (resource.loading)
    return (
      <PageWorkspace navigationReady={false}>
        {header}
        <AdminResourceNotice resource={resource} />
        <PageState title="Loading Run" variant="loading" />
      </PageWorkspace>
    );
  if (resource.error || !resource.data)
    return (
      <PageWorkspace>
        {header}
        <AdminResourceNotice resource={resource} />
        <PageState
          action={
            <Button onClick={resource.refresh} type="button">
              Try again
            </Button>
          }
          title="Run could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  const isLive =
    isActivePipelineRun(resource.data.status) ||
    hasActiveActionRuns(resource.data.actions);
  return (
    <PageWorkspace>
      {header}
      <AdminResourceNotice resource={resource} />
      <Group justify="space-between">
        <Title order={2} size="h4">
          Actions
        </Title>
        {isLive ? (
          <Text size="sm" c="dimmed">
            Updates automatically.
          </Text>
        ) : null}
      </Group>
      {resource.data.actions.length ? (
        <EditorAccordion compact chevronPosition="left" value={panels} onChange={setPanels} order={3}>
          <Stack
            component="ol"
            aria-label="Pipeline Actions"
            gap="md"
            m={0}
            p={0}
            style={{ listStyle: "none" }}
          >
            {resource.data.actions.map((action) => (
              <ActionRunItem
                action={action}
                key={action.id}
                onRetry={(id) => void retry(id)}
                retrying={retryingActionId === action.id}
                retryDisabled={retryingActionId !== null}
                retryError={retryErrors[action.id]}
              />
            ))}
          </Stack>
        </EditorAccordion>
      ) : (
        <PageState title="No Actions in this Run" variant="empty" />
      )}
    </PageWorkspace>
  );
}
