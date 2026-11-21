"use client";
import { CollectionSearch } from "@/components/patterns/collection-search";
import {
  FilterPanel,
  FilterField,
  FilterActions,
} from "@/components/patterns/filter-panel";
import { NativeSelect } from "@mantine/core";
import { parsePageSize as normalizePageSize } from "@/shared/pagination";

import {
  CollectionBulkActions,
  useCollectionSelection,
} from "@/components/patterns/collection-bulk-actions";

import {
  listPipelines,
  deletePipeline,
  updatePipelineConfiguration,
  type AdminPipeline,
} from "@/client/admin-api/pipelines";
import { ActiveFilterChips } from "@/components/patterns/active-filter-chips";
import { CreatePipelineDialog } from "@/components/pipelines/create-pipeline-dialog";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { useAppNavigation } from "@/components/layout/app-link";
import { CollectionSkeleton } from "@/components/patterns/collection-skeleton";
import { PageHeader } from "@/components/patterns/page-header";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { TagList } from "@/components/tags/tag-list";
import { ResourceTable } from "@/components/patterns/resource-table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { matchesSelectedTags, TagFilter } from "@/components/tags/tag-filter";
import { Button, VisuallyHidden, Text, Tooltip } from "@mantine/core";
import { PipelineRowActions } from "@/components/pipelines/pipeline-row-actions";
import { useState } from "react";
import { listTags } from "@/client/admin-api/sources";
import type { AdminTag } from "@/shared/contracts/admin";

export type PipelinesListQuery = {
  create?: string;
  search?: string;
  page?: string;
  size?: string;
  sourceId?: string;
  tagId?: string | string[];
};

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string | undefined): 10 | 50 | 100 {
  return normalizePageSize(value);
}

function tagIdsFromQuery(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.filter(Boolean))];
}

export function PipelinesScreen({
  initialQuery,
  loadPipelines = listPipelines,
  loadTags = listTags,
}: {
  initialQuery?: PipelinesListQuery;
  loadPipelines?: () => Promise<AdminPipeline[]>;
  loadTags?: () => Promise<AdminTag[]>;
}) {
  const navigation = useAppNavigation();
  const tagCatalog = useAdminResource(loadTags, undefined, {
    policy: "ambient",
  });
  const resource = useAdminResource(loadPipelines, undefined, {
    policy: "ambient",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 50 | 100>(10);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const urlControlled = Boolean(initialQuery);
  const [localSearch, setLocalSearch] = useState("");
  const search = urlControlled ? (initialQuery?.search ?? "") : localSearch;
  const selectedPage = urlControlled ? pageNumber(initialQuery?.page) : page;
  const selectedPageSize = urlControlled
    ? parsePageSize(initialQuery?.size)
    : pageSize;
  const selectedTagIds = urlControlled
    ? tagIdsFromQuery(initialQuery?.tagId)
    : tagIds;
  const sourceId = initialQuery?.sourceId;
  const [bulkPending, setBulkPending] = useState(false);
  const selection = useCollectionSelection({
    items: resource.data ?? [],
    getId: (item) => item.id,
    scope: JSON.stringify([search, sourceId, [...selectedTagIds].sort()]),
  });

  const createPipeline = (
    <CreatePipelineDialog
      key={String(initialQuery?.create) + ":" + (sourceId ?? "")}
      initialSourceId={sourceId}
      initiallyOpen={initialQuery?.create === "1"}
    />
  );
  const header = <PageHeader actions={createPipeline} title="Pipelines" />;

  if (resource.loading)
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header}
        <AdminResourceNotice resource={resource} />
        <CollectionSkeleton label="Loading Pipelines" />
      </PageWorkspace>
    );
  if (resource.error || !resource.data)
    return (
      <PageWorkspace width="collection">
        {header}
        <AdminResourceNotice resource={resource} />
        <PageState
          action={
            <Button onClick={resource.refresh} type="button">
              Try again
            </Button>
          }
          title="Pipelines could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  if (resource.data.length === 0 && !sourceId && !selectedTagIds.length)
    return (
      <PageWorkspace width="collection">
        {header}
        <AdminResourceNotice resource={resource} />
        <PageState title="No Pipelines yet" variant="empty">
          Create a Pipeline to define what happens to a Source&apos;s
          Submissions.
        </PageState>
      </PageWorkspace>
    );

  function changeQuery(next: {
    search?: string;
    page: number;
    pageSize: 10 | 50 | 100;
    tagIds: string[];
    sourceId?: string | null;
  }) {
    if (!urlControlled) {
      setLocalSearch(next.search ?? search);
      setPage(next.page);
      setPageSize(next.pageSize);
      setTagIds(next.tagIds);
      return;
    }
    const parameters = new URLSearchParams();
    if (next.search ?? search) parameters.set("search", next.search ?? search);
    const nextSourceId =
      next.sourceId === null ? undefined : (next.sourceId ?? sourceId);
    if (nextSourceId) parameters.set("sourceId", nextSourceId);
    if (next.page !== 1) parameters.set("page", String(next.page));
    if (next.pageSize !== 10) parameters.set("size", String(next.pageSize));
    for (const tagId of next.tagIds) parameters.append("tagId", tagId);
    const query = parameters.toString();
    navigation.go(query ? `/app/pipelines?${query}` : "/app/pipelines");
  }

  const filteredPipelines = resource.data.filter(
    (pipeline) =>
      matchesSelectedTags(pipeline.tags, selectedTagIds) &&
      (pipeline.name + " " + pipeline.sourceName)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (!sourceId || pipeline.sourceId === sourceId),
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filteredPipelines.length / selectedPageSize),
  );
  const currentPage = Math.min(selectedPage, pageCount);
  const visiblePipelines = filteredPipelines.slice(
    (currentPage - 1) * selectedPageSize,
    currentPage * selectedPageSize,
  );

  return (
    <PageWorkspace width="collection">
      <>
        {header}
        <AdminResourceNotice resource={resource} />
        <AdminResourceNotice resource={tagCatalog} />
        <FilterPanel
          formKey={sourceId ?? ""}
          label="Collection filters"
          activeCount={sourceId ? 1 : 0}
          onSubmit={(event) => {
            event.preventDefault();
            changeQuery({
              page: 1,
              pageSize: selectedPageSize,
              tagIds: selectedTagIds,
              sourceId:
                String(
                  new FormData(event.currentTarget).get("sourceId") || "",
                ) || null,
            });
          }}
          toolbar={
            <CollectionSearch
              value={search}
              onChange={(text) =>
                changeQuery({
                  page: 1,
                  pageSize: selectedPageSize,
                  tagIds: selectedTagIds,
                  search: text,
                })
              }
            />
          }
          tags={
            <TagFilter
              onSelectedTagIdsChange={(next) =>
                changeQuery({
                  page: 1,
                  pageSize: selectedPageSize,
                  tagIds: next,
                })
              }
              selectedTagIds={selectedTagIds}
              showClearAction
              tags={[
                ...(tagCatalog.data ?? []),
                ...resource.data.flatMap((pipeline) => pipeline.tags),
              ]}
            />
          }
        >
          <FilterField span={12}>
            <NativeSelect
              label="Source"
              name="sourceId"
              defaultValue={sourceId ?? ""}
              data={[
                { value: "", label: "All Sources" },
                ...Array.from(
                  new Map(
                    resource.data
                      .map((item) => ({
                        id: item.sourceId,
                        name: item.sourceName,
                      }))
                      .map((item) => [
                        item.id,
                        { value: item.id, label: item.name },
                      ]),
                  ).values(),
                ),
              ]}
            />
          </FilterField>
          <FilterActions
            span={12}
            hasFilters={Boolean(sourceId)}
            onReset={() =>
              changeQuery({
                page: 1,
                pageSize: selectedPageSize,
                tagIds: selectedTagIds,
                sourceId: null,
              })
            }
          />
        </FilterPanel>
        <ActiveFilterChips
          chips={
            sourceId
              ? [
                  {
                    id: "source",
                    label:
                      "Source: " +
                      (resource.data.find(
                        (pipeline) => pipeline.sourceId === sourceId,
                      )?.sourceName ?? "Selected Source"),
                    onRemove: () =>
                      changeQuery({
                        page: 1,
                        pageSize: selectedPageSize,
                        tagIds: selectedTagIds,
                        sourceId: null,
                      }),
                  },
                ]
              : []
          }
        />
        <CollectionBulkActions
          selected={selection.selected}
          getName={(item) => item.name}
          onClear={selection.clear}
          onRetain={selection.retain}
          onChanged={resource.refresh}
          onPendingChange={setBulkPending}
          actions={[
            {
              id: "enable",
              label: "Enable selected",
              description:
                "Enable these Pipelines. Each Pipeline must have at least one enabled Action.",
              run: (item) =>
                updatePipelineConfiguration(item.id, { enabled: true }),
            },
            {
              id: "disable",
              label: "Disable selected",
              description: "These Pipelines will no longer start new Runs.",
              run: (item) =>
                updatePipelineConfiguration(item.id, { enabled: false }),
            },
            {
              id: "delete",
              label: "Delete selected",
              destructive: true,
              description:
                "Permanently deletes these Pipelines and their Actions. Existing Pipeline Runs stay in history. Pipelines with active Runs cannot be deleted.",
              eligible: (item) => !item.enabled,
              blockedReason: (count) =>
                count +
                (count === 1
                  ? " selected Pipeline is enabled. Disable it before deletion."
                  : " selected Pipelines are enabled. Disable them before deletion."),
              run: (item) => deletePipeline(item.id),
            },
          ]}
          selectAll={
            selection.forPage(visiblePipelines).allSelected === true
              ? {
                  total: filteredPipelines.length,
                  onClick: () => selection.selectAll(filteredPipelines),
                }
              : undefined
          }
        >
          {(bulkActions) => (
            <>
              {filteredPipelines.length ? (
                <>
                  <ResourceTable
                    bulkActions={bulkActions}
                    pagination={{
                      onPageChange: (next) =>
                        changeQuery({
                          page: next,
                          pageSize: selectedPageSize,
                          tagIds: selectedTagIds,
                        }),
                      onPageSizeChange: (value) =>
                        changeQuery({
                          page: 1,
                          pageSize: value as 10 | 50 | 100,
                          tagIds: selectedTagIds,
                        }),
                      page: currentPage,
                      pageSize: selectedPageSize,
                      total: filteredPipelines.length,
                    }}
                    ariaLabel="Pipelines"
                    selection={selection.forPage(visiblePipelines, bulkPending)}
                    columns={[
                      {
                        id: "name",
                        label: "Pipeline",
                        render: (pipeline) => (
                          <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                            {pipeline.name}
                          </Text>
                        ),
                      },
                      {
                        id: "source",
                        label: "Source",
                        render: (pipeline) => (
                          <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                            {pipeline.sourceName}
                          </Text>
                        ),
                      },
                      {
                        className: "text-right",
                        id: "steps",
                        label: (
                          <Tooltip
                            label="Number of enabled Actions"
                            events={{ hover: true, focus: true, touch: true }}
                            withArrow
                          >
                            <Text component="span" inherit tabIndex={0}>
                              Actions
                            </Text>
                          </Tooltip>
                        ),
                        width: 112,
                        render: (pipeline) => (
                          <Text size="sm">
                            {
                              pipeline.steps.filter((step) => step.enabled)
                                .length
                            }
                          </Text>
                        ),
                        sizing: "compact",
                      },
                      {
                        id: "status",
                        label: "Status",
                        render: (pipeline) => (
                          <StatusBadge
                            status={pipeline.enabled ? "active" : "inactive"}
                            subtle
                          >
                            {pipeline.enabled ? "Enabled" : "Disabled"}
                          </StatusBadge>
                        ),
                        sizing: "compact",
                      },
                      {
                        id: "tags",
                        label: "Tags",
                        width: 160,
                        render: (pipeline) => <TagList tags={pipeline.tags} />,
                      },
                      {
                        className: "text-right",
                        id: "actions",
                        label: <VisuallyHidden>Options</VisuallyHidden>,
                        mobileAction: true,
                        mobileLabel: "Options",
                        render: (pipeline) => (
                          <PipelineRowActions
                            pipeline={pipeline}
                            onChanged={resource.refresh}
                          />
                        ),
                        sizing: "action",
                      },
                    ]}
                    getRowKey={(pipeline) => pipeline.id}
                    items={visiblePipelines}
                    onRowClick={(pipeline) =>
                      navigation.go(`/app/pipelines/${pipeline.id}`)
                    }
                  />
                </>
              ) : (
                <CollectionEmptyState
                  sourceHref={
                    resource.data?.find(
                      (pipeline) => pipeline.sourceId === sourceId,
                    )
                      ? "/app/sources/" +
                        encodeURIComponent(
                          resource.data!.find(
                            (pipeline) => pipeline.sourceId === sourceId,
                          )!.sourcePublicId,
                        )
                      : undefined
                  }
                  records="Pipelines"
                  sourceId={sourceId}
                  filtered={selectedTagIds.length > 0 || search.length > 0}
                />
              )}
            </>
          )}
        </CollectionBulkActions>
      </>
    </PageWorkspace>
  );
}
