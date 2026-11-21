"use client";
import { CollectionSearch } from "@/components/patterns/collection-search";
import { parsePageSize as normalizePageSize } from "@/shared/pagination";

import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { RowNavigationItems } from "@/components/patterns/row-navigation-items";
import { VisuallyHidden } from "@mantine/core";

import { LocalDateTime } from "@/components/patterns/local-date-time";

import {
  listPipelineRuns,
  type PipelineRunPage,
  type PipelineRunQuery,
  type AdminPipelineRun,
} from "@/client/admin-api/pipelines";
import { useAdminResource } from "@/client/use-admin-resource";
import { useAppNavigation } from "@/components/layout/app-link";
import { hasActivePipelineRuns } from "@/components/pipelines/pipeline-run-status";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { PageHeader } from "@/components/patterns/page-header";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { ResourceTable } from "@/components/patterns/resource-table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button, Text } from "@mantine/core";

export function PipelineRunsScreen({
  pipelineId,
  initialQuery = {},
  loadRuns = listPipelineRuns,
}: {
  pipelineId: string;
  initialQuery?: { page?: string; size?: string; search?: string };
  loadRuns?: (
    id: string,
    query: PipelineRunQuery,
  ) => Promise<PipelineRunPage<AdminPipelineRun>>;
}) {
  const navigation = useAppNavigation();
  const requestedPage = Number(initialQuery.page);
  const requestedSize = Number(initialQuery.size);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const size = normalizePageSize(requestedSize);
  const resource = useAdminResource(
    () => loadRuns(pipelineId, { page, size, search: initialQuery.search }),
    `${pipelineId}:${page}:${size}:${initialQuery.search ?? ""}`,
    {
      active: (result) => hasActivePipelineRuns(result.items),
      policy: "operational",
      keepPreviousData: true,
    },
  );
  function navigate(
    nextPage: number,
    nextSize: number,
    search = initialQuery.search,
  ) {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (nextPage > 1) query.set("page", String(nextPage));
    if (nextSize !== 10) query.set("size", String(nextSize));
    navigation.go(
      `/app/pipelines/${encodeURIComponent(pipelineId)}/runs${query.size ? `?${query}` : ""}`,
    );
  }
  const header = (
    <PageHeader
      back={{
        href: `/app/pipelines/${encodeURIComponent(pipelineId)}`,
        label: "Back to Pipeline",
      }}
      title="Pipeline Runs"
    />
  );
  const searchControl = (
    <CollectionSearch
      value={initialQuery.search ?? ""}
      onChange={(value) => navigate(1, size, value)}
      placeholder="Search Runs"
    />
  );
  if (resource.loading && !resource.data)
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header}
        <PageState title="Loading Runs" variant="loading" />
      </PageWorkspace>
    );
  if (resource.error || !resource.data)
    return (
      <PageWorkspace width="collection">
        {header}
        <PageState
          action={<Button onClick={resource.refresh}>Try again</Button>}
          title="Runs could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  if (!resource.data.items.length)
    return (
      <PageWorkspace width="collection">
        {header}
        <AdminResourceNotice resource={resource} />
        {searchControl}
        <CollectionEmptyState
          records="Pipeline Runs"
          pipelineId={pipelineId}
          filtered={Boolean(initialQuery.search)}
        />
      </PageWorkspace>
    );
  const result = resource.data;
  const runs = result.items;
  return (
    <PageWorkspace width="collection">
      {header}
      <AdminResourceNotice resource={resource} />
      {searchControl}
      {hasActivePipelineRuns(runs) ? (
        <Text size="sm" c="dimmed">
          Updates automatically.
        </Text>
      ) : null}
      <ResourceTable
        busy={resource.loading}
        pagination={{
          onPageChange: (page) => navigate(page, result.pageSize),
          onPageSizeChange: (size) => navigate(1, size),
          page: resource.data.page,
          pageSize: resource.data.pageSize,
          total: resource.data.total,
        }}

        ariaLabel="Pipeline Runs"
        columns={[
          {
            id: "created",
            width: 176,
            label: "Started",
            render: (run) => (
              <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
                <LocalDateTime value={run.createdAt} />
              </Text>
            ),
          },
          { id: "summary", label: "Progress", render: (run) => run.summary },
          {
            id: "status",
            label: "Status",
            width: 224,
            sizing: "compact",
            render: (run) => (
              <StatusBadge
                status={
                  run.status === "completed"
                    ? "success"
                    : run.status === "completed_attention"
                      ? "warning"
                      : run.status === "cancelled"
                        ? "error"
                        : "inactive"
                }
              >
                {
                  {
                    cancelled: "Cancelled",
                    completed: "Completed",
                    completed_attention: "Completed with attention",
                    pending: "Pending",
                    processing: "Processing",
                  }[run.status]
                }
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
                        "/app/pipelines/" +
                        encodeURIComponent(pipelineId) +
                        "/runs/" +
                        encodeURIComponent(run.id),
                    },
                    run.submissionId
                      ? {
                          label: "Open Submission",
                          href:
                            "/app/submissions/" +
                            encodeURIComponent(run.submissionId) +
                            "?returnTo=" +
                            encodeURIComponent(
                              "/app/pipelines/" +
                                encodeURIComponent(pipelineId) +
                                "/runs" +
                                (page > 1 || size !== 10
                                  ? "?page=" + page + "&size=" + size
                                  : ""),
                            ),
                        }
                      : false,
                    {
                      label: "Open Pipeline",
                      href: "/app/pipelines/" + encodeURIComponent(pipelineId),
                    },
                  ]}
                />
              </RowActionsMenu>
            ),
          },
        ]}
        getRowKey={(run) => run.id}
        items={runs}
        onRowClick={(run) =>
          navigation.go(
            `/app/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(run.id)}`,
          )
        }
      />
    </PageWorkspace>
  );
}
