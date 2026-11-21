"use client";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { RowNavigationItems } from "@/components/patterns/row-navigation-items";
import { VisuallyHidden } from "@mantine/core";

import { DataViewControl } from "@/components/patterns/data-view-control";
import { DetailRow } from "@/components/patterns/detail-row";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { useRef, useState } from "react";

import {
  deleteSubmission,
  getSubmission,
} from "@/client/admin-api/submissions";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import { hasActivePipelineRuns } from "@/components/pipelines/pipeline-run-status";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { ResourceSection } from "@/components/patterns/resource-section";
import { ResourceTable } from "@/components/patterns/resource-table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { SubmissionPayload } from "@/components/submissions/submission-payload";
import {
  Button,
  Box,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
} from "@mantine/core";
import { ReadableValue } from "@/components/inbox/inbox-item-values";
import { TagList } from "@/components/tags/tag-list";
import type { AdminSubmissionDetail } from "@/shared/contracts/admin";
import { LocalDateTime } from "@/components/patterns/local-date-time";

type SubmissionDetailScreenProperties = {
  deleteSubmission?: (submissionId: string) => Promise<void>;
  loadSubmission?: (submissionId: string) => Promise<AdminSubmissionDetail>;
  returnTo?: string;
  submissionId: string;
};

function collectionPath(returnTo: string | undefined) {
  if (!returnTo) return "/app/submissions";
  try {
    const url = new URL(returnTo, "https://forman.invalid");
    return url.origin === "https://forman.invalid" &&
      ([
        "/app",
        "/app/submissions",
        "/app/sources",
        "/app/pipeline-runs",
        "/app/inbox",
      ].includes(url.pathname) ||
        /^\/app\/pipelines\/[A-Za-z0-9_-]+\/runs$/.test(url.pathname))
      ? url.pathname + url.search
      : "/app/submissions";
  } catch {
    return "/app/submissions";
  }
}

function pipelineRunProgress(
  run: AdminSubmissionDetail["pipelineRuns"][number],
) {
  return `${run.completedActionCount} / ${run.actionCount}`;
}

function pipelineRunStatus(run: AdminSubmissionDetail["pipelineRuns"][number]) {
  if (run.status === "completed") return "success" as const;
  if (run.status === "completed_attention" || run.status === "cancelled")
    return "error" as const;
  return "warning" as const;
}

export function SubmissionDetailScreen({
  deleteSubmission: removeSubmission = deleteSubmission,
  loadSubmission = getSubmission,
  returnTo,
  submissionId,
}: SubmissionDetailScreenProperties) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigation = useAppNavigation();
  const submissionsPath = collectionPath(returnTo);
  const submission = useAdminResource(
    () => loadSubmission(submissionId),
    submissionId,
    {
      active: (value) =>
        value.state === "draft" || hasActivePipelineRuns(value.pipelineRuns),
      policy: "operational",
    },
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [payloadView, setPayloadView] = useState<"fields" | "json">("fields");
  const originPath = submissionsPath.split("?")[0];
  const back = {
    href: submissionsPath,
    label:
      originPath === "/app"
        ? "Back to Dashboard"
        : originPath === "/app/sources"
          ? "Back to all Sources"
          : originPath === "/app/pipeline-runs" ||
              /^\/app\/pipelines\/[A-Za-z0-9_-]+\/runs$/.test(originPath)
            ? "Back to Pipeline Runs"
            : originPath === "/app/inbox"
              ? "Back to Inbox"
              : "Back to all Submissions",
  };

  if (submission.loading)
    return (
      <PageWorkspace navigationReady={false}>
        <PageHeader
          back={back}
          metadata={`ID: ${submissionId}`}
          title="Submission"
        />
        <PageState title="Loading Submission" variant="loading" />
      </PageWorkspace>
    );
  if (submission.error || !submission.data)
    return (
      <PageWorkspace>
        <PageHeader back={back} metadata={`ID: ${submissionId}`} title="Submission" />
        <PageState
          action={
            <Button onClick={submission.refresh} type="button">
              Try again
            </Button>
          }
          title="Submission could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );

  const current = submission.data;
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeSubmission(current.id);
      navigation.go(submissionsPath);
    } catch {
      setDeleteError("The Submission could not be deleted. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageWorkspace>
      <PageHeader
        back={back}
        actions={
          <>
            <RowActionsMenu
              detail
              label="Submission actions"
              disabled={deleting}
              triggerRef={triggerRef}
            >
              <Menu.Item
                component={AppLink}
                href={"/app/sources/" + current.sourcePublicId}
              >
                Open Source
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                disabled={
                  deleting ||
                  (current.state !== undefined && current.state !== "completed")
                }
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                Delete permanently
              </Menu.Item>
              {current.state !== undefined && current.state !== "completed" ? (
                <Text size="xs" c="dimmed" px="sm" pb={6}>
                  Only completed Submissions can be deleted.
                </Text>
              ) : null}
            </RowActionsMenu>
            <ConfirmDialog
              opened={deleteOpen}
              title="Delete Submission?"
              confirmLabel="Delete permanently"
              pendingLabel="Deleting…"
              pending={deleting}
              error={deleteError}
              returnFocusTo={triggerRef}
              onCancel={() => setDeleteOpen(false)}
              onConfirm={() => void remove()}
            >
              This permanently deletes this captured submission. This action
              cannot be undone.
            </ConfirmDialog>
          </>
        }
        description={
          <Group gap={6} wrap="wrap" style={{ overflowWrap: "anywhere" }}>
            <span>{current.sourceName}</span>
            <span aria-hidden="true">·</span>
            <span>Received <LocalDateTime value={current.createdAt} /></span>
            <span aria-hidden="true">·</span>
            <span>ID: {current.id}</span>
          </Group>
        }
        documentTitle={current.sourceName + " · Submission"}
        status={
          <StatusBadge
            status={
              current.state === "draft"
                ? "warning"
                : current.state === "expired"
                  ? "inactive"
                  : "success"
            }
          >
            {current.state === "draft"
              ? "Draft"
              : current.state === "expired"
                ? "Expired"
                : "Completed"}
          </StatusBadge>
        }
        title="Submission"
      />
      <AdminResourceNotice resource={submission} />
      {current.tags.length ? <TagList tags={current.tags} /> : null}
      <ResourceSection
        title="Data"
        actions={
          <DataViewControl value={payloadView} onChange={setPayloadView} />
        }
      >
        {payloadView === "fields" ? (
          <ReadableValue value={current.payload} />
        ) : (
          <SubmissionPayload payload={current.payload} />
        )}
        {current.meta || current.userAgent || current.referer ? (
          <>
            <Divider my="sm" />
            <Group gap="sm" justify="space-between" wrap="wrap">
              {current.meta ? (
                <Group gap="xs" wrap="wrap">
                  <Text size="sm" c="dimmed">Session updates: {current.meta.sessionUpdateCount}</Text>
                  <Text size="sm" c="dimmed" aria-hidden="true">·</Text>
                  <Text size="sm" c="dimmed">Session requests: {current.meta.sessionRequestCount}</Text>
                </Group>
              ) : null}
              {current.userAgent || current.referer ? (
                <Button variant="subtle" size="compact-sm"
                  aria-expanded={technicalOpen}
                  aria-controls="submission-technical-details"
                  onClick={() => setTechnicalOpen((open) => !open)}>
                  Technical details
                </Button>
              ) : null}
            </Group>
            {current.userAgent || current.referer ? (
              <Box hidden={!technicalOpen} id="submission-technical-details">
                <Stack component="dl" gap="sm" m={0} mt="sm">
                  {current.userAgent ? <DetailRow label="User-Agent">{current.userAgent}</DetailRow> : null}
                  {current.referer ? <DetailRow label="Referer">{current.referer}</DetailRow> : null}
                </Stack>
              </Box>
            ) : null}
          </>
        ) : null}
      </ResourceSection>
      <ResourceSection title="Pipeline Runs">
        {hasActivePipelineRuns(current.pipelineRuns) ? (
          <Text size="sm" c="dimmed" mb="md">
            Updates automatically.
          </Text>
        ) : null}
        {current.pipelineRuns.length === 0 ? (
          <Text size="sm" c="dimmed">
            {current.state === "draft"
              ? "Pipeline Runs will start after final submission."
              : current.state === "expired"
                ? "This session expired before final submission. Its answers have been removed."
                : "No Pipeline Runs."}
          </Text>
        ) : (
          <ResourceTable
            ariaLabel="Pipeline Runs"
            embedded
            getRowKey={(run) => run.id}
            items={current.pipelineRuns}
            onRowClick={(run) =>
              navigation.go(
                `/app/submissions/${encodeURIComponent(current.id)}/pipeline-runs/${encodeURIComponent(run.id)}`,
              )
            }
            columns={[
              {
                id: "started",
                label: "Started",
                width: 176,
                render: (run) => (
                  <Text size="sm">
                    <LocalDateTime value={run.createdAt} />
                  </Text>
                ),
              },
              {
                id: "pipeline",
                label: "Pipeline",
                render: (run) =>
                  run.pipelineId ? (
                    <Text size="sm">{run.pipelineName}</Text>
                  ) : (
                    <Text component="span" size="sm" c="dimmed">
                      Deleted pipeline
                    </Text>
                  ),
              },
              {
                id: "progress",
                label: "Progress",
                render: pipelineRunProgress,
              },
              {
                id: "status",
                label: "Status",
                render: (run) => (
                  <StatusBadge status={pipelineRunStatus(run)}>
                    {run.status === "completed_attention"
                      ? "Completed with attention"
                      : run.status[0].toUpperCase() + run.status.slice(1)}
                  </StatusBadge>
                ),
              },
              {
                id: "actions",
                label: <VisuallyHidden>Actions</VisuallyHidden>,
                sizing: "action",
                mobileAction: true,
                render: (run) => (
                  <RowActionsMenu label={"Actions for Run " + run.id}>
                    <RowNavigationItems
                      items={[
                        {
                          label: "Open Pipeline Run",
                          href:
                            "/app/submissions/" +
                            encodeURIComponent(current.id) +
                            "/pipeline-runs/" +
                            encodeURIComponent(run.id),
                        },
                        Boolean(run.pipelineId) && {
                          label: "Open Pipeline",
                          href:
                            "/app/pipelines/" +
                            encodeURIComponent(run.pipelineId!),
                        },
                        {
                          label: "Open Source",
                          href:
                            "/app/sources/" +
                            encodeURIComponent(current.sourcePublicId),
                        },
                      ]}
                    />
                  </RowActionsMenu>
                ),
              },
            ]}
          />
        )}
      </ResourceSection>
    </PageWorkspace>
  );
}
