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

import { SourceRelatedMenuItems } from "@/components/patterns/related-menu-items";

import { RowNavigationItems } from "@/components/patterns/row-navigation-items";

import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { HelpTooltip } from "@/components/patterns/help-tooltip";
import { useRef, useState } from "react";

import type { AdminSourceSummary } from "@/client/admin-api/sources";
import { useAppNavigation } from "@/components/layout/app-link";
import { ActiveFilterChips } from "@/components/patterns/active-filter-chips";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { PageState } from "@/components/patterns/page-state";
import { TagList } from "@/components/tags/tag-list";
import { ResourceTable } from "@/components/patterns/resource-table";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  matchesSelectedTags,
  TagFilter,
  TagFilterEmptyState,
} from "@/components/tags/tag-filter";
import { Group, Menu, Stack, Text, VisuallyHidden } from "@mantine/core";
import { deleteSource, setSourceEnabled } from "@/client/admin-api/sources";
import { LocalDateTime } from "@/components/patterns/local-date-time";
import { toast } from "sonner";

export type SourcesListQuery = {
  search?: string;
  page?: string;
  size?: string;
  status?: string;
  tagId?: string | string[];
};

export type SourceStatusFilter = "active" | "inactive";

function statusFromQuery(
  value: string | undefined,
): SourceStatusFilter | undefined {
  return value === "active" || value === "inactive" ? value : undefined;
}

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

type SourceListItem = Pick<
  AdminSourceSummary,
  | "pipelineCount"
  | "pageCount"
  | "fieldDefinitionMode"
  | "fieldDefinitionSource"
  | "enabled"
  | "sourceId"
  | "id"
  | "lastSubmission"
  | "name"
  | "type"
  | "totalSubmissionCount"
  | "submissionsLast24Hours"
  | "submissionsLast7Days"
  | "submissionsLast30Days"
  | "tags"
>;

function SourceRowActions({
  form,
  onChanged,
}: {
  form: SourceListItem;
  onChanged: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

  async function updateState() {
    setPending(true);
    try {
      await setSourceEnabled(form.sourceId, !form.enabled);
      toast.success(form.enabled ? "Source deactivated" : "Source activated");
      onChanged();
    } catch {
      toast.error("The Source state could not be updated.");
    } finally {
      setPending(false);
      setDeactivateDialogOpen(false);
    }
  }

  async function removeSource() {
    setPending(true);
    setDeleteError("");
    try {
      await deleteSource(form.sourceId);
      setDeleteDialogOpen(false);
      toast.success("Source deleted");
      onChanged();
    } catch {
      setDeleteError("The Source could not be deleted. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <RowActionsMenu
        label={"Actions for " + form.name}
        disabled={pending}
        triggerRef={triggerRef}
      >
        <RowNavigationItems
          items={[
            {
              label: "Open Source",
              href: "/app/sources/" + encodeURIComponent(form.sourceId),
            },
          ]}
        />
        <SourceRelatedMenuItems
          source={form}
          pipelineCount={form.pipelineCount}
          pageCount={form.pageCount}
        />
        <Menu.Divider />
        <Menu.Item
          disabled={pending}
          onClick={() => {
            if (form.enabled) setDeactivateDialogOpen(true);
            else void updateState();
          }}
        >
          {form.enabled ? "Deactivate" : "Activate"}
        </Menu.Item>
        {!form.enabled ? (
          <>
            <Menu.Divider />
            <Menu.Item
              color="red"
              disabled={pending}
              onClick={() => {
                setDeleteError("");
                setDeleteDialogOpen(true);
              }}
            >
              Delete permanently
            </Menu.Item>
          </>
        ) : null}
      </RowActionsMenu>
      <ConfirmDialog
        opened={form.enabled && deactivateDialogOpen}
        title={"Deactivate “" + form.name + "”?"}
        confirmLabel="Deactivate"
        pending={pending}
        returnFocusTo={triggerRef}
        onCancel={() => setDeactivateDialogOpen(false)}
        onConfirm={() => void updateState()}
      >
        Stops all Submissions until the Source is reactivated.
      </ConfirmDialog>
      <ConfirmDialog
        opened={!form.enabled && deleteDialogOpen}
        title={"Delete “" + form.name + "” permanently?"}
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        pending={pending}
        error={deleteError}
        returnFocusTo={triggerRef}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void removeSource()}
      >
        Permanently deletes the Source and its stored Submissions.
      </ConfirmDialog>
    </>
  );
}

export function SourcesList({
  initialQuery,
  onChanged = () => undefined,
  onQueryChange,
  sources,
  tags = [],
}: {
  initialQuery?: SourcesListQuery;
  onChanged?: () => void;
  onQueryChange?: (query: {
    search?: string;
    page: string;
    size: string;
    status?: SourceStatusFilter;
    tagId: string[];
  }) => void;
  sources: SourceListItem[];
  tags?: NonNullable<AdminSourceSummary["tags"]>;
}) {
  const navigation = useAppNavigation();
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState<10 | 50 | 100>(10);
  const [localTagIds, setLocalTagIds] = useState<string[]>([]);
  const [localStatus, setLocalStatus] = useState<SourceStatusFilter>();
  const urlControlled = Boolean(onQueryChange);
  const [localSearch, setLocalSearch] = useState("");
  const search = urlControlled ? (initialQuery?.search ?? "") : localSearch;
  const page = urlControlled ? pageNumber(initialQuery?.page) : localPage;
  const pageSize = urlControlled
    ? parsePageSize(initialQuery?.size)
    : localPageSize;
  const tagIds = urlControlled
    ? tagIdsFromQuery(initialQuery?.tagId)
    : localTagIds;
  const status = urlControlled
    ? statusFromQuery(initialQuery?.status)
    : localStatus;
  const [bulkPending, setBulkPending] = useState(false);
  const selection = useCollectionSelection({
    items: sources,
    getId: (item) => item.id,
    scope: JSON.stringify([search, status, [...tagIds].sort()]),
  });

  function changeQuery(next: {
    search?: string;
    page: number;
    pageSize: 10 | 50 | 100;
    status?: SourceStatusFilter;
    tagIds: string[];
  }) {
    if (onQueryChange) {
      onQueryChange({
        search: next.search ?? search,
        page: String(next.page),
        size: String(next.pageSize),
        status: next.status,
        tagId: next.tagIds,
      });
      return;
    }
    setLocalSearch(next.search ?? search);
    setLocalPage(next.page);
    setLocalPageSize(next.pageSize);
    setLocalStatus(next.status);
    setLocalTagIds(next.tagIds);
  }

  if (sources.length === 0) {
    return (
      <PageState title="No Sources yet" variant="empty">
        Create the first Source to receive protected Submissions.
      </PageState>
    );
  }

  const filteredSources = sources.filter(
    (source) =>
      matchesSelectedTags(source.tags, tagIds) &&
      source.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (status === undefined || source.enabled === (status === "active")),
  );
  const pageCount = Math.max(1, Math.ceil(filteredSources.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleForms = filteredSources.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <>
      <FilterPanel
        formKey={status ?? ""}
        label="Collection filters"
        activeCount={status ? 1 : 0}
        onSubmit={(event) => {
          event.preventDefault();
          changeQuery({
            page: 1,
            pageSize,
            tagIds,
            status: statusFromQuery(
              String(new FormData(event.currentTarget).get("status")),
            ),
          });
        }}
        toolbar={
          <CollectionSearch
            value={search}
            onChange={(text) =>
              changeQuery({ page: 1, pageSize, status, tagIds, search: text })
            }
          />
        }
        tags={
          <TagFilter
            onSelectedTagIdsChange={(nextTagIds) => {
              changeQuery({ page: 1, pageSize, status, tagIds: nextTagIds });
            }}
            selectedTagIds={tagIds}
            showClearAction
            tags={tags}
          />
        }
      >
        <FilterField span={12}>
          <NativeSelect
            label="Status"
            name="status"
            defaultValue={status ?? ""}
            data={[
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </FilterField>
        <FilterActions
          span={12}
          hasFilters={Boolean(status)}
          onReset={() =>
            changeQuery({ page: 1, pageSize, tagIds, status: undefined })
          }
        />
      </FilterPanel>
      <ActiveFilterChips
        chips={
          status
            ? [
                {
                  id: "status",
                  label:
                    status === "active" ? "Status: Active" : "Status: Inactive",
                  onRemove: () => changeQuery({ page: 1, pageSize, tagIds }),
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
        onChanged={onChanged}
        onPendingChange={setBulkPending}
        actions={[
          {
            id: "activate",
            label: "Activate selected",
            description: "Allow these Sources to receive Submissions.",
            run: (item) => setSourceEnabled(item.sourceId, true),
          },
          {
            id: "deactivate",
            label: "Deactivate selected",
            description:
              "Stops Submissions for these Sources until reactivated.",
            run: (item) => setSourceEnabled(item.sourceId, false),
          },
          {
            id: "delete",
            label: "Delete selected",
            destructive: true,
            description:
              "Permanently deletes the selected Sources and their Submissions, sessions, Pipelines, Actions, Runs, Inbox items and Built-in Forms. This cannot be undone.",
            eligible: (item) => !item.enabled,
            blockedReason: (count) =>
              count +
              (count === 1
                ? " selected Source is active. Deactivate it before deletion."
                : " selected Sources are active. Deactivate them before deletion."),
            run: (item) => deleteSource(item.sourceId),
          },
        ]}
        selectAll={
          selection.forPage(visibleForms).allSelected === true
            ? {
                total: filteredSources.length,
                onClick: () => selection.selectAll(filteredSources),
              }
            : undefined
        }
      >
        {(bulkActions) => (
          <>
            {filteredSources.length ? (
              <>
                <ResourceTable
                  bulkActions={bulkActions}
                  pagination={{
                    onPageChange: (nextPage) =>
                      changeQuery({ page: nextPage, pageSize, status, tagIds }),
                    onPageSizeChange: (nextPageSize) => {
                      changeQuery({
                        page: 1,
                        pageSize: nextPageSize as 10 | 50 | 100,
                        status,
                        tagIds,
                      });
                    },
                    page: currentPage,
                    pageSize: pageSize,
                    total: filteredSources.length,
                  }}
                  ariaLabel="Sources"
                  selection={selection.forPage(visibleForms, bulkPending)}

                  columns={[
                    {
                      id: "name",
                      label: "Source",
                      render: (form) => (
                        <Text
                          size="sm"
                          fw={500}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {form.name}
                        </Text>
                      ),
                    },
                    {
                      id: "type",
                      label: "Type",
                      width: 96,
                      render: (form) =>
                        form.type === "session"
                          ? "Session"
                          : form.type === "m2m"
                            ? "M2M"
                            : "One-shot",
                      sizing: "compact",
                    },
                    {
                      className: "text-right",
                      id: "pipelines",
                      label: "Pipelines",
                      width: 104,
                      render: (form) => (
                        <Text size="sm">{form.pipelineCount}</Text>
                      ),
                      sizing: "compact",
                    },
                    {
                      className: "text-right",
                      id: "submissions",
                      label: "Submissions",
                      width: 140,
                      render: (form) => (
                        <Group
                          gap={4}
                          w="fit-content"
                          ml={{ base: 0, md: "auto" }}
                          wrap="nowrap"
                        >
                          <Text size="sm">{form.totalSubmissionCount}</Text>
                          <HelpTooltip
                            label={"Submission statistics for " + form.name}
                          >
                            <Stack gap={2}>
                              <Text size="xs">
                                24 h: {form.submissionsLast24Hours}
                              </Text>
                              <Text size="xs">
                                7 d: {form.submissionsLast7Days}
                              </Text>
                              <Text size="xs">
                                30 d: {form.submissionsLast30Days}
                              </Text>
                              <Text size="xs">
                                Total: {form.totalSubmissionCount}
                              </Text>
                            </Stack>
                          </HelpTooltip>
                        </Group>
                      ),
                      sizing: "compact",
                    },
                    {
                      id: "last-submission",
                      label: "Last Submission",
                      width: 176,
                      render: (form) =>
                        form.lastSubmission ? (
                          <LocalDateTime
                            value={form.lastSubmission.createdAt}
                          />
                        ) : (
                          "—"
                        ),
                    },
                    {
                      id: "status",
                      label: "Status",
                      width: 104,
                      render: (form) => (
                        <StatusBadge
                          status={form.enabled ? "active" : "inactive"}
                          subtle
                        >
                          {form.enabled ? "Active" : "Inactive"}
                        </StatusBadge>
                      ),
                      sizing: "compact",
                    },
                    {
                      id: "tags",
                      label: "Tags",
                      width: 160,
                      render: (form) => <TagList tags={form.tags ?? []} />,
                    },
                    {
                      className: "text-right",
                      id: "actions",
                      label: <VisuallyHidden>Actions</VisuallyHidden>,
                      mobileAction: true,
                      mobileLabel: "Actions",
                      render: (form) => (
                        <SourceRowActions form={form} onChanged={onChanged} />
                      ),
                      sizing: "action",
                    },
                  ]}
                  getRowKey={(form) => form.id}
                  items={visibleForms}
                  onRowClick={(form) =>
                    navigation.go(`/app/sources/${form.sourceId}`)
                  }
                />
              </>
            ) : tagIds.length ? (
              <TagFilterEmptyState />
            ) : (
              <PageState title="No Sources match this filter" variant="empty">
                Remove the filter to see all Sources.
              </PageState>
            )}
          </>
        )}
      </CollectionBulkActions>
    </>
  );
}
