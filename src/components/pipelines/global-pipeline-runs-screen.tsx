"use client";
import { ActiveFilterChips } from "@/components/patterns/active-filter-chips";
import { CollectionSearch } from "@/components/patterns/collection-search";
import { parsePageSize as normalizePageSize } from "@/shared/pagination";

import { RowNavigationItems } from "@/components/patterns/row-navigation-items";
import { VisuallyHidden } from "@mantine/core";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";

import { NativeSelect, Text } from "@mantine/core";
import {
  FilterActions,
  FilterField,
  FilterPanel,
} from "@/components/patterns/filter-panel";
import {
  DateRangeError,
  DateRangeFields,
  useDateRangeError,
} from "@/components/patterns/date-range-filter";

import { type FormEvent } from "react";

import {
  listPipelines,
  listGlobalPipelineRuns,
  type PipelineRunPage,
  type AdminGlobalPipelineRun,
  type AdminPipeline,
  type PipelineRunQuery,
} from "@/client/admin-api/pipelines";
import {
  listSources,
  listTags,
  type AdminSourceSummary,
} from "@/client/admin-api/sources";
import { useAdminResource } from "@/client/use-admin-resource";
import { useAppNavigation } from "@/components/layout/app-link";
import { hasActivePipelineRuns } from "@/components/pipelines/pipeline-run-status";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { PageHeader } from "@/components/patterns/page-header";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { TagList } from "@/components/tags/tag-list";
import { ResourceTable } from "@/components/patterns/resource-table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { TagFilter } from "@/components/tags/tag-filter";
import { Button } from "@mantine/core";
import type { AdminTag } from "@/shared/contracts/admin";
import { LocalDateTime } from "@/components/patterns/local-date-time";

export type PipelineRunsScreenQuery = Omit<
  PipelineRunQuery,
  "page" | "size"
> & {
  page?: string | number;
  size?: string | number;
  tagId?: string | string[];
};

function tagIds(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function pathFor(query: PipelineRunsScreenQuery) {
  const parameters = new URLSearchParams();
  if (query.actionStatus) parameters.set("actionStatus", query.actionStatus);
  if (query.search) parameters.set("search", query.search);
  if (query.sourceId) parameters.set("sourceId", query.sourceId);
  if (query.pipelineId) parameters.set("pipelineId", query.pipelineId);
  if (query.status) parameters.set("status", query.status);
  if (query.from) parameters.set("from", query.from);
  if (query.to) parameters.set("to", query.to);
  if (Number(query.page) > 1) parameters.set("page", String(query.page));
  if (query.size && Number(query.size) !== 10)
    parameters.set("size", String(query.size));
  for (const tagId of tagIds(query.tagId))
    if (tagId) parameters.append("tagId", tagId);
  const search = parameters.toString();
  return search ? `/app/pipeline-runs?${search}` : "/app/pipeline-runs";
}

function progress(run: AdminGlobalPipelineRun) {
  return `${run.completedActionCount} / ${run.actionCount}`;
}

function statusTone(status: AdminGlobalPipelineRun["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "error" as const;
  return "warning" as const;
}

function statusLabel(status: AdminGlobalPipelineRun["status"]) {
  return status === "completed_attention"
    ? "Completed with attention"
    : status[0].toUpperCase() + status.slice(1);
}

function PipelineRunsFilters({
  pipelines,
  query,
  sources,
  tags,
  onApply,
  onTagsChange,
}: {
  onApply: (next: PipelineRunQuery) => void;
  onTagsChange: (next: string[]) => void;
  pipelines: AdminPipeline[];
  query: PipelineRunQuery;
  sources: AdminSourceSummary[];
  tags: AdminTag[];
}) {
  const dateRange = useDateRangeError();
  const hasFilters = Boolean(
    query.sourceId ||
    query.pipelineId ||
    query.status ||
    query.actionStatus ||
    query.from ||
    query.to ||
    query.tagIds?.length,
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const value = (name: string) =>
      typeof values.get(name) === "string"
        ? String(values.get(name)).trim() || undefined
        : undefined;
    if (!dateRange.check(event.currentTarget, value("from"), value("to")))
      return false;
    const status = value("status");
    const actionStatus =
      status === "failed_actions_24h"
        ? "failed_24h"
        : status === "failed_actions"
          ? "failed"
          : undefined;
    onApply({
      search: query.search,
      actionStatus,
      from: value("from"),
      pipelineId:
        value("pipelineId") === "all" ? undefined : value("pipelineId"),
      sourceId: value("sourceId") === "all" ? undefined : value("sourceId"),
      status:
        status === "all" || actionStatus
          ? undefined
          : (status as PipelineRunQuery["status"]),
      tagIds: query.tagIds,
      to: value("to"),
    });
  }
  return (
    <>
      <FilterPanel
        formKey={JSON.stringify([
          query.sourceId,
          query.pipelineId,
          query.from,
          query.to,
          query.status,
          query.actionStatus,
        ])}
        toolbar={
          <CollectionSearch
            value={query.search ?? ""}
            onChange={(search) =>
              onApply({ ...query, search: search || undefined, page: 1 })
            }
            placeholder="Search Sources and Pipelines"
          />
        }
        tags={
          <TagFilter
            onSelectedTagIdsChange={onTagsChange}
            selectedTagIds={query.tagIds ?? []}
            showClearAction
            tags={tags}
          />
        }
        label="Pipeline Run filters"
        onSubmit={submit}
        activeCount={
          [
            query.sourceId,
            query.pipelineId,
            query.status || query.actionStatus,
            query.from,
            query.to,
          ].filter(Boolean).length
        }
      >
        <FilterField>
          <NativeSelect
            label="Source"
            defaultValue={query.sourceId ?? "all"}
            id="pipeline-run-source"
            name="sourceId"
          >
            <option value="all">All Sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField>
          <NativeSelect
            label="Pipeline"
            defaultValue={query.pipelineId ?? "all"}
            id="pipeline-run-pipeline"
            name="pipelineId"
          >
            <option value="all">All Pipelines</option>
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField span={12}>
          <NativeSelect
            label="Status"
            defaultValue={
              query.actionStatus === "failed_24h"
                ? "failed_actions_24h"
                : query.actionStatus
                  ? "failed_actions"
                  : (query.status ?? "all")
            }
            id="pipeline-run-status"
            name="status"
          >
            <option value="all">All statuses</option>
            <option value="failed_actions">With failed Actions</option>
            <option value="failed_actions_24h">
              With failed Actions · Last 24 hours
            </option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="completed_attention">
              Completed with attention
            </option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
        </FilterField>
        <DateRangeFields
          idPrefix="pipeline-run"
          defaultFrom={query.from}
          defaultTo={query.to}
          error={dateRange.error}
          onEdit={dateRange.clear}
        />
        <FilterActions
          hasFilters={hasFilters}
          onReset={() =>
            onApply({ search: query.search, tagIds: query.tagIds })
          }
        />
        <DateRangeError idPrefix="pipeline-run" error={dateRange.error} />
      </FilterPanel>
      <ActiveFilterChips
        chips={[
          {
            id: "sourceId",
            label:
              "Source: " +
              (sources.find((item) => item.id === query.sourceId)?.name ??
                query.sourceId),
            onRemove: () => onApply({ ...query, sourceId: undefined }),
            active: Boolean(query.sourceId),
          },
          {
            id: "pipelineId",
            label:
              "Pipeline: " +
              (pipelines.find((item) => item.id === query.pipelineId)?.name ??
                query.pipelineId),
            onRemove: () => onApply({ ...query, pipelineId: undefined }),
            active: Boolean(query.pipelineId),
          },
          {
            id: "from",
            label: "From: " + query.from,
            onRemove: () => onApply({ ...query, from: undefined }),
            active: Boolean(query.from),
          },
          {
            id: "to",
            label: "To: " + query.to,
            onRemove: () => onApply({ ...query, to: undefined }),
            active: Boolean(query.to),
          },
          {
            id: "status",
            label: "Status: " + query.status,
            onRemove: () => onApply({ ...query, status: undefined }),
            active: Boolean(query.status),
          },
          {
            id: "actionStatus",
            label: "Actions: " + query.actionStatus,
            onRemove: () => onApply({ ...query, actionStatus: undefined }),
            active: Boolean(query.actionStatus),
          },
        ].filter((chip) => chip.active)}
      />
    </>
  );
}

export function GlobalPipelineRunsScreen({
  initialQuery = {},
  loadPipelines = listPipelines,
  loadRuns = listGlobalPipelineRuns,
  loadSources = listSources,
  loadTags = listTags,
}: {
  initialQuery?: PipelineRunsScreenQuery;
  loadPipelines?: () => Promise<AdminPipeline[]>;
  loadRuns?: (
    query: PipelineRunQuery,
  ) => Promise<PipelineRunPage<AdminGlobalPipelineRun>>;
  loadSources?: () => Promise<AdminSourceSummary[]>;
  loadTags?: () => Promise<AdminTag[]>;
}) {
  const navigation = useAppNavigation();
  const page = Number(initialQuery.page);
  const size = Number(initialQuery.size);
  const query: PipelineRunQuery = {
    ...initialQuery,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    size: normalizePageSize(size),
    tagIds: tagIds(initialQuery.tagId),
  };
  const returnParameters = new URLSearchParams();
  for (const [key, value] of Object.entries(initialQuery)) {
    if (value !== undefined)
      for (const entry of Array.isArray(value) ? value : [String(value)])
        returnParameters.append(key, entry);
  }
  const returnPath =
    "/app/pipeline-runs" +
    (returnParameters.size ? "?" + returnParameters.toString() : "");
  const resourcesKey = JSON.stringify(query);
  const sources = useAdminResource(loadSources);
  const pipelines = useAdminResource(loadPipelines);
  const tags = useAdminResource(loadTags);
  const resource = useAdminResource(() => loadRuns(query), resourcesKey, {
    active: (result) => hasActivePipelineRuns(result.items),
    policy: "operational",
    keepPreviousData: true,
  });
  const header = <PageHeader title="Pipeline Runs" />;
  if (
    (resource.loading && !resource.data) ||
    sources.loading ||
    pipelines.loading ||
    tags.loading
  )
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header}
        <PageState title="Loading Pipeline Runs" variant="loading" />
      </PageWorkspace>
    );
  if (
    resource.error ||
    sources.error ||
    pipelines.error ||
    tags.error ||
    !resource.data ||
    !sources.data ||
    !pipelines.data ||
    !tags.data
  )
    return (
      <PageWorkspace width="collection">
        {header}
        <PageState
          action={
            <Button
              onClick={() => {
                resource.refresh();
                sources.refresh();
                pipelines.refresh();
                tags.refresh();
              }}
              type="button"
            >
              Try again
            </Button>
          }
          title="Pipeline Runs could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  const apply = (next: PipelineRunQuery) =>
    navigation.go(
      pathFor({ ...next, page: 1, size: query.size, tagId: next.tagIds }),
    );
  const sourcePublicIds = new Map(
    sources.data.map((source) => [source.id, source.sourceId]),
  );
  const sourceTags = new Map(
    sources.data.map((source) => [source.id, source.tags]),
  );
  const filters = (
    <PipelineRunsFilters
      onApply={apply}
      onTagsChange={(next) =>
        navigation.go(pathFor({ ...query, page: 1, tagId: next }))
      }
      pipelines={pipelines.data}
      query={query}
      sources={sources.data}
      tags={tags.data}
    />
  );
  if (resource.data.items.length === 0)
    return (
      <PageWorkspace width="collection">
        {header}
        <AdminResourceNotice resources={[resource, sources, pipelines, tags]} />
        {filters}
        <CollectionEmptyState
          records="Pipeline Runs"
          sourceHref={
            query.sourceId && sourcePublicIds.has(query.sourceId)
              ? "/app/sources/" +
                encodeURIComponent(sourcePublicIds.get(query.sourceId)!)
              : undefined
          }
          sourceId={query.sourceId}
          pipelineId={query.pipelineId}
          filtered={Boolean(
            query.search ||
            query.tagIds?.length ||
            query.status ||
            query.actionStatus ||
            query.from ||
            query.to,
          )}
        />
      </PageWorkspace>
    );
  return (
    <PageWorkspace width="collection">
      {header}
      <AdminResourceNotice resources={[resource, sources, pipelines, tags]} />
      {filters}
      {hasActivePipelineRuns(resource.data.items) ? (
        <Text size="sm" c="dimmed">
          Updates automatically.
        </Text>
      ) : null}
      <ResourceTable
        busy={resource.loading}
        pagination={{
          onPageChange: (page) =>
            navigation.go(pathFor({ ...query, page, tagId: query.tagIds })),
          onPageSizeChange: (size) =>
            navigation.go(
              pathFor({ ...query, page: 1, size, tagId: query.tagIds }),
            ),
          page: resource.data.page,
          pageSize: resource.data.pageSize,
          total: resource.data.total,
        }}
        ariaLabel="Pipeline Runs"
        getRowKey={(run) => run.id}
        items={resource.data.items}
        onRowClick={(run) =>
          navigation.go(`/app/pipeline-runs/${encodeURIComponent(run.id)}`)
        }
        columns={[
          {
            id: "submitted",
            label: "Received",
            width: 176,
            sizing: "compact",
            render: (run) => (
              <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
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
            id: "source",
            label: "Source",
            render: (run) => <Text size="sm">{run.sourceName}</Text>,
          },
          { id: "progress", label: "Progress", width: 160, sizing: "compact", render: progress },
          {
            id: "status",
            label: "Status",
            width: 160,
            sizing: "compact",
            render: (run) => (
              <StatusBadge status={statusTone(run.status)}>
                {statusLabel(run.status)}
              </StatusBadge>
            ),
          },
          {
            id: "tags",
            label: "Tags",
            width: 160,
            render: (run) => (
              <TagList tags={sourceTags.get(run.sourceId) ?? []} />
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
                      href: "/app/pipeline-runs/" + encodeURIComponent(run.id),
                    },
                    {
                      label: "Open Submission",
                      href: `/app/submissions/${encodeURIComponent(run.submissionId)}?returnTo=${encodeURIComponent(returnPath)}`,
                    },
                    Boolean(run.pipelineId) && {
                      label: "Open Pipeline",
                      href:
                        "/app/pipelines/" + encodeURIComponent(run.pipelineId!),
                    },
                    sourcePublicIds.has(run.sourceId) && {
                      label: "Open Source",
                      href:
                        "/app/sources/" +
                        encodeURIComponent(sourcePublicIds.get(run.sourceId)!),
                    },
                  ]}
                />
              </RowActionsMenu>
            ),
          },
        ]}
      />
    </PageWorkspace>
  );
}
