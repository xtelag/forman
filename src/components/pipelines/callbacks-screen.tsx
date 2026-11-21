"use client";
import { ActiveFilterChips } from "@/components/patterns/active-filter-chips";
import { CollectionSearch } from "@/components/patterns/collection-search";
import { parsePageSize as normalizePageSize } from "@/shared/pagination";

import { RowNavigationItems } from "@/components/patterns/row-navigation-items";
import { VisuallyHidden } from "@mantine/core";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";

import { Button, NativeSelect, Stack, Text } from "@mantine/core";
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

import type { FormEvent } from "react";

import {
  listPipelines,
  listWaitingCallbacks,
  type AdminPipeline,
  type AdminWaitingCallback,
  type CallbackQuery,
} from "@/client/admin-api/pipelines";
import {
  listSources,
  listTags,
  type AdminSourceSummary,
} from "@/client/admin-api/sources";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { useAppNavigation } from "@/components/layout/app-link";
import { PageHeader } from "@/components/patterns/page-header";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { TagList } from "@/components/tags/tag-list";
import { ResourceTable } from "@/components/patterns/resource-table";
import { TagFilter } from "@/components/tags/tag-filter";
import type { AdminTag } from "@/shared/contracts/admin";
import { LocalDateTime } from "@/components/patterns/local-date-time";

export type CallbacksScreenQuery = CallbackQuery & {
  tagId?: string | string[];
};

function tags(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}
function page(value: number | undefined) {
  return value && value > 0 ? value : 1;
}
function size(value: number | undefined): 10 | 50 | 100 {
  return normalizePageSize(value);
}
function pathFor(query: CallbackQuery) {
  const parameters = new URLSearchParams();
  if (query.olderThanMinutes)
    parameters.set("olderThanMinutes", String(query.olderThanMinutes));
  if (query.search) parameters.set("search", query.search);
  if (query.sourceId) parameters.set("sourceId", query.sourceId);
  if (query.pipelineId) parameters.set("pipelineId", query.pipelineId);
  if (query.from) parameters.set("from", query.from);
  if (query.to) parameters.set("to", query.to);
  if (query.page && query.page > 1) parameters.set("page", String(query.page));
  if (query.size && query.size !== 10)
    parameters.set("size", String(query.size));
  for (const tagId of query.tagIds ?? []) parameters.append("tagId", tagId);
  const search = parameters.toString();
  return search ? `/app/callbacks?${search}` : "/app/callbacks";
}

function Filters({
  onApply,
  onTagsChange,
  pipelines,
  query,
  sources,
  tags: availableTags,
}: {
  onApply: (next: CallbackQuery) => void;
  onTagsChange: (next: string[]) => void;
  pipelines: AdminPipeline[];
  query: CallbackQuery;
  sources: AdminSourceSummary[];
  tags: AdminTag[];
}) {
  const hasFilters = Boolean(
    query.olderThanMinutes ||
    query.sourceId ||
    query.pipelineId ||
    query.from ||
    query.to ||
    query.tagIds?.length,
  );
  const dateRange = useDateRangeError();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) =>
      String(data.get(name) || "").trim() || undefined;
    if (!dateRange.check(event.currentTarget, value("from"), value("to")))
      return false;
    onApply({
      search: query.search,
      ...query,
      olderThanMinutes: value("olderThanMinutes")
        ? Number(value("olderThanMinutes"))
        : undefined,
      from: value("from"),
      page: 1,
      pipelineId:
        value("pipelineId") === "all" ? undefined : value("pipelineId"),
      sourceId: value("sourceId") === "all" ? undefined : value("sourceId"),
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
          query.olderThanMinutes,
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
            tags={availableTags}
          />
        }
        label="Waiting Callback filters"
        onSubmit={submit}
        activeCount={
          [
            query.olderThanMinutes,
            query.sourceId,
            query.pipelineId,
            query.from,
            query.to,
          ].filter(Boolean).length
        }
      >
        <FilterField>
          <NativeSelect
            label="Source"
            defaultValue={query.sourceId ?? "all"}
            id="callback-source"
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
            id="callback-pipeline"
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
        <FilterField>
          <NativeSelect
            label="Waiting at least"
            defaultValue={query.olderThanMinutes ?? ""}
            id="callback-age"
            name="olderThanMinutes"
          >
            <option value="">Any duration</option>
            <option value="60">One hour</option>
            {query.olderThanMinutes && query.olderThanMinutes !== 60 ? (
              <option value={query.olderThanMinutes}>
                {query.olderThanMinutes} minutes
              </option>
            ) : null}
          </NativeSelect>
        </FilterField>
        <DateRangeFields
          idPrefix="callback"
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
        <DateRangeError idPrefix="callback" error={dateRange.error} />
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
            id: "olderThanMinutes",
            label:
              "Waiting at least: " + (String(query.olderThanMinutes) + " min"),
            onRemove: () => onApply({ ...query, olderThanMinutes: undefined }),
            active: Boolean(query.olderThanMinutes),
          },
        ].filter((chip) => chip.active)}
      />
    </>
  );
}

export function CallbacksScreen({
  initialQuery = {},
  loadCallbacks = listWaitingCallbacks,
  loadPipelines = listPipelines,
  loadSources = listSources,
  loadTags = listTags,
}: {
  initialQuery?: CallbacksScreenQuery;
  loadCallbacks?: (
    query: CallbackQuery,
  ) => Promise<{ items: AdminWaitingCallback[]; total: number }>;
  loadPipelines?: () => Promise<AdminPipeline[]>;
  loadSources?: () => Promise<AdminSourceSummary[]>;
  loadTags?: () => Promise<AdminTag[]>;
}) {
  const navigation = useAppNavigation();
  const query: CallbackQuery = {
    ...initialQuery,
    page: page(initialQuery.page),
    size: size(initialQuery.size),
    tagIds: tags(initialQuery.tagId),
  };
  const key = JSON.stringify(query);
  const callbacks = useAdminResource(() => loadCallbacks(query), key, {
    active: (value) => value.items.length > 0,
    policy: "operational",
    keepPreviousData: true,
  });
  const sources = useAdminResource(loadSources);
  const pipelines = useAdminResource(loadPipelines);
  const availableTags = useAdminResource(loadTags);
  const header = <PageHeader title="Waiting Callbacks" />;
  if (
    (callbacks.loading && !callbacks.data) ||
    sources.loading ||
    pipelines.loading ||
    availableTags.loading
  )
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header}
        <AdminResourceNotice
          resources={[callbacks, sources, pipelines, availableTags]}
        />
        <PageState title="Loading Waiting Callbacks" variant="loading" />
      </PageWorkspace>
    );
  if (
    callbacks.error ||
    sources.error ||
    pipelines.error ||
    availableTags.error ||
    !callbacks.data ||
    !sources.data ||
    !pipelines.data ||
    !availableTags.data
  )
    return (
      <PageWorkspace width="collection">
        {header}
        <AdminResourceNotice
          resources={[callbacks, sources, pipelines, availableTags]}
        />
        <PageState
          action={
            <Button
              onClick={() => {
                callbacks.refresh();
                sources.refresh();
                pipelines.refresh();
                availableTags.refresh();
              }}
              type="button"
            >
              Try again
            </Button>
          }
          title="Waiting Callbacks could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  const apply = (next: CallbackQuery) => navigation.go(pathFor(next));
  const sourcePublicIds = new Map(
    sources.data.map((source) => [source.id, source.sourceId]),
  );
  const sourceTags = new Map(
    sources.data.map((source) => [source.id, source.tags]),
  );
  const filters = (
    <Filters
      onApply={apply}
      onTagsChange={(next) => apply({ ...query, page: 1, tagIds: next })}
      pipelines={pipelines.data}
      query={query}
      sources={sources.data}
      tags={availableTags.data}
    />
  );
  if (callbacks.data.items.length === 0)
    return (
      <PageWorkspace width="collection">
        {header}
        <AdminResourceNotice
          resources={[callbacks, sources, pipelines, availableTags]}
        />
        {filters}
        <CollectionEmptyState
          records="Waiting Callbacks"
          title="No Waiting Callbacks"
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
            query.olderThanMinutes ||
            query.from ||
            query.to ||
            query.tagIds?.length,
          )}
        />
      </PageWorkspace>
    );
  return (
    <PageWorkspace width="collection">
      {header}
      <AdminResourceNotice
        resources={[callbacks, sources, pipelines, availableTags]}
      />
      {filters}
      <Text size="sm" c="dimmed">
        Updates automatically.
      </Text>
      <ResourceTable
        busy={callbacks.loading}
        pagination={{
          onPageChange: (next) => apply({ ...query, page: next }),
          onPageSizeChange: (next) =>
            apply({ ...query, page: 1, size: next as 10 | 50 | 100 }),
          page: query.page ?? 1,
          pageSize: query.size ?? 10,
          total: callbacks.data.total,
        }}
        ariaLabel="Waiting Callbacks"
        columns={[
          {
            id: "action",
            label: "Action",
            render: (callback) => (
              <Stack gap={2}>
                <Text size="sm">{callback.actionName}</Text>
                <Text size="sm" c="dimmed">
                  {callback.actionType === "email_confirmation"
                    ? "Email Confirmation"
                    : callback.actionType === "callback_boolean"
                      ? "Callback Touch"
                      : "Callback"}
                </Text>
              </Stack>
            ),
          },
          {
            id: "pipeline",
            label: "Pipeline",
            render: (callback) =>
              callback.pipelineId ? (
                <Text size="sm">{callback.pipelineName}</Text>
              ) : (
                <Text component="span" size="sm" c="dimmed">
                  Deleted pipeline
                </Text>
              ),
          },
          {
            id: "source",
            label: "Source",
            render: (callback) => <Text size="sm">{callback.sourceName}</Text>,
          },
          {
            id: "waiting",
            label: "Waiting since",
            width: 176,
            sizing: "compact",
            render: (callback) => (
              <LocalDateTime value={callback.waitingSince} />
            ),
          },
          {
            id: "expires",
            label: "Expires",
            width: 176,
            sizing: "compact",
            render: (callback) => (
              <LocalDateTime value={callback.callbackExpiresAt} />
            ),
          },
          {
            id: "tags",
            label: "Tags",
            width: 160,
            render: (callback) => (
              <TagList tags={sourceTags.get(callback.sourceId) ?? []} />
            ),
          },
          {
            id: "actions",
            label: <VisuallyHidden>Actions</VisuallyHidden>,
            sizing: "action",
            mobileAction: true,
            render: (callback) => (
              <RowActionsMenu label={"Actions for Callback " + callback.id}>
                <RowNavigationItems
                  items={[
                    {
                      label: "Open waiting Action",
                      href:
                        "/app/pipeline-runs/" +
                        encodeURIComponent(callback.runId) +
                        "#" +
                        encodeURIComponent(callback.id),
                    },
                    {
                      label: "Open Pipeline Run",
                      href:
                        "/app/pipeline-runs/" +
                        encodeURIComponent(callback.runId),
                    },
                    Boolean(callback.pipelineId) && {
                      label: "Open Pipeline",
                      href:
                        "/app/pipelines/" +
                        encodeURIComponent(callback.pipelineId!),
                    },
                    sourcePublicIds.has(callback.sourceId) && {
                      label: "Open Source",
                      href:
                        "/app/sources/" +
                        encodeURIComponent(
                          sourcePublicIds.get(callback.sourceId)!,
                        ),
                    },
                  ]}
                />
              </RowActionsMenu>
            ),
          },
        ]}
        getRowKey={(callback) => callback.id}
        items={callbacks.data.items}
        onRowClick={(callback) =>
          navigation.go(
            `/app/pipeline-runs/${encodeURIComponent(callback.runId)}#${encodeURIComponent(callback.id)}`,
          )
        }
      />
    </PageWorkspace>
  );
}
