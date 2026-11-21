"use client";
import { PAGE_SIZES } from "@/shared/pagination";

import { parsePageSize as normalizePageSize } from "@/shared/pagination";


import { SubmissionRowActions } from "@/components/submissions/submission-row-actions";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { DataTable } from "mantine-datatable";
import {
  Box,
  Divider,
  Button,
  Group,
  Paper,
  Progress,
  Loader,
  Text,
  VisuallyHidden,
} from "@mantine/core";

import {
  listSources,
  listTags,
  type AdminSourceSummary,
} from "@/client/admin-api/sources";
import {
  deleteSubmissionSelection as deleteSubmissionSelectionRequest,
  listSubmissions,
  type SubmissionQuery,
} from "@/client/admin-api/submissions";
import { ActiveFilterChips } from "@/components/patterns/active-filter-chips";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import { CollectionSkeleton } from "@/components/patterns/collection-skeleton";
import { PageHeader } from "@/components/patterns/page-header";
import { CreateSourceDialog } from "@/components/sources/create-source-dialog";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { tableColumnWidths } from "@/components/patterns/table-column-widths";
import { TagFilter } from "@/components/tags/tag-filter";
import {
  SubmissionFilters,
  type SubmissionFiltersValue,
} from "@/components/submissions/submission-filters";
import {
  submissionDetailPath,
  submissionTableColumns,
} from "@/components/submissions/submission-table-columns";
import {
  clearSubmissionSelection,
  isSubmissionSelected,
  selectAllMatchingSubmissions,
  selectSubmission,
  selectedSubmissionCount,
  toSubmissionDeleteSelection,
  type SubmissionSelection,
} from "@/components/submissions/submission-selection";
import type {
  AdminSubmissionsResponse,
  AdminTag,
  SubmissionDeleteSelection,
  SubmissionFilter,
} from "@/shared/contracts/admin";

export type SubmissionScreenQuery = SubmissionFiltersValue & {
  page?: string;
  /** Rolling window set by links such as the Dashboard; only "24h" exists. */
  period?: string;
  size?: string;
  tagId?: string | string[];
};

type SubmissionsScreenProperties = {
  deleteSubmissionSelection?: (
    selection: SubmissionDeleteSelection,
  ) => Promise<{ deleted: number; hasMore?: boolean }>;
  initialQuery: SubmissionScreenQuery;
  loadSources?: () => Promise<AdminSourceSummary[]>;
  loadTags?: () => Promise<AdminTag[]>;
  loadSubmissions?: (
    query: SubmissionQuery,
  ) => Promise<AdminSubmissionsResponse>;
};

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function pageSize(value: string | undefined): 10 | 50 | 100 {
  return normalizePageSize(value);
}

function cleanFilters(value: SubmissionFiltersValue): SubmissionFiltersValue {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== "",
    ),
  ) as SubmissionFiltersValue;
}

const periodLength = { "24h": 24 * 60 * 60 * 1_000 } as const;
type SubmissionPeriod = keyof typeof periodLength;

function periodFromQuery(
  value: string | undefined,
  filters: SubmissionFiltersValue,
): SubmissionPeriod | undefined {
  // An explicit date range replaces the rolling window.
  if (filters.from || filters.to) return undefined;
  return value === "24h" ? value : undefined;
}

function periodStart(period: SubmissionPeriod | undefined) {
  return period
    ? new Date(Date.now() - periodLength[period]).toISOString()
    : undefined;
}

function tagIdsFromQuery(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.filter(Boolean))];
}

function queryString(value: SubmissionScreenQuery) {
  const parameters = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      for (const value of item) if (value) parameters.append(key, value);
    } else if (
      item !== undefined &&
      item !== "" &&
      !(key === "page" && item === "1") &&
      !(key === "size" && item === "10")
    ) {
      parameters.set(key, item);
    }
  }
  return parameters.toString();
}

function submissionPath(value: SubmissionScreenQuery) {
  const query = queryString(value);
  return query ? `/app/submissions?${query}` : "/app/submissions";
}

function header() {
  return <PageHeader title="Submissions" />;
}

const submissionWidths = tableColumnWidths([...submissionTableColumns(), { id: "actions", sizing: "action" }], 44);

export function SubmissionsScreen({
  deleteSubmissionSelection: removeSelection = deleteSubmissionSelectionRequest,
  initialQuery,
  loadSources = listSources,
  loadTags = listTags,
  loadSubmissions = listSubmissions,
}: SubmissionsScreenProperties) {
  const navigation = useAppNavigation();
  const [searchDraft, updateSearchDraft] = useState(initialQuery.search ?? "");
  const {
    page: requestedPage,
    size: requestedSize,
    period: requestedPeriod,
    tagId,
    ...rawFilters
  } = initialQuery;
  const filters = cleanFilters(rawFilters);
  const period = periodFromQuery(requestedPeriod, filters);
  const tagIds = tagIdsFromQuery(tagId);
  /** Filters that belong in /app/submissions links, including the period. */
  const linkFilters: SubmissionScreenQuery = period
    ? { ...filters, period }
    : filters;
  function collectionFilter(): SubmissionFilter {
    const from = periodStart(period);
    const value = from ? { ...filters, from } : filters;
    return tagIds.length > 0 ? { ...value, tagIds } : value;
  }
  const page = pageNumber(requestedPage);
  const size = pageSize(requestedSize);
  const filtersKey = queryString({ ...linkFilters, tagId: tagIds });
  const [suspendedSearchKey, setSuspendedSearchKey] = useState<string | null>(
    null,
  );
  const handleSearchDraft = useCallback((search: string) => {
    updateSearchDraft(search);
    setSuspendedSearchKey(null);
  }, []);
  function navigateFilters(query: SubmissionScreenQuery) {
    setSuspendedSearchKey(filtersKey);
    navigation.go(submissionPath(query));
  }
  const [selectionState, setSelectionState] = useState<{
    filtersKey: string;
    selection: SubmissionSelection;
  }>({ filtersKey, selection: null });
  // Clear stored selection as well as the rendered selection. Otherwise returning
  // to an earlier filter would unexpectedly resurrect a destructive selection.
  if (selectionState.filtersKey !== filtersKey) setSelectionState({ filtersKey, selection: null });
  const selection =
    selectionState.filtersKey === filtersKey ? selectionState.selection : null;
  function setSelection(
    next:
      | SubmissionSelection
      | ((current: SubmissionSelection) => SubmissionSelection),
  ) {
    setSelectionState((current) => {
      const currentSelection =
        current.filtersKey === filtersKey ? current.selection : null;
      return {
        filtersKey,
        selection: typeof next === "function" ? next(currentSelection) : next,
      };
    });
  }
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [deletedCount, setDeletedCount] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(0);
  useEffect(() => {
    if (!deleting) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [deleting]);
  const [topControls, setTopControls] = useState<HTMLDivElement | null>(null);
  const sources = useAdminResource(loadSources);
  const tags = useAdminResource(loadTags);
  const submissionsQuery = queryString({
    ...linkFilters,
    page: String(page),
    size: String(size),
    tagId: tagIds,
  });
  const submissions = useAdminResource(
    () =>
      loadSubmissions({
        ...(selection?.type === "filter" ? selection.filter : collectionFilter()),
        ...(selection?.type === "filter" ? { snapshotBefore: selection.snapshotBefore } : {}),
        limit: size,
        offset: (page - 1) * size,
      }),
    submissionsQuery + (selection?.type === "filter" ? selection.snapshotBefore : ""),
    {
      keepPreviousData: true,
      policy: "operational",
      inactiveInterval: 30_000,
      active: (result) => result.items.some((item) => item.state === "draft"),
    },
  );

  const [showLoading, setShowLoading] = useState(false);
  const pending = submissions.loading || submissions.refreshing;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setShowLoading(true), 300);
    return () => { window.clearTimeout(timer); setShowLoading(false); };
  }, [pending]);

  function applyFilters(value: SubmissionFiltersValue) {
    const next = cleanFilters(value);
    navigation.go(
      submissionPath({
        ...next,
        period: next.from || next.to ? undefined : period,
        size: String(size),
        tagId: tagIds,
      }),
    );
  }

  if (sources.loading || tags.loading)
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header()}
        <AdminResourceNotice resources={[submissions, sources, tags]} />
        <CollectionSkeleton label="Loading Submissions" />
      </PageWorkspace>
    );
  if (sources.error || tags.error || !sources.data || !tags.data) {
    return (
      <PageWorkspace width="collection">
        {header()}
        <AdminResourceNotice resources={[submissions, sources, tags]} />
        <PageState
          action={
            <Button
              onClick={() => {
                sources.refresh();
                tags.refresh();
                submissions.refresh();
              }}
              type="button"
            >
              Try again
            </Button>
          }
          title="Submissions could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  }

  const submissionData = submissions.data ?? {
    items: [],
    total: 0,
    deletableTotal: 0,
  };
  const returnTo = submissionPath({
    ...linkFilters,
    page: String(page),
    size: String(size),
    tagId: tagIds,
  });
  const deletableTotal = submissionData.deletableTotal ?? submissionData.total;
  const selectedCount = selectedSubmissionCount(selection);
  const deleteSelection = toSubmissionDeleteSelection(selection);

  async function removeSelected() {
    if (!deleteSelection || deletingRef.current) return;
    deletingRef.current = true;
    setDeletedCount(0);
    setDeleting(true);
    setDeleteError(null);
    try {
      let hasMore: boolean;
      do {
        const result = await removeSelection(deleteSelection);
        setDeletedCount(count => count + result.deleted);
        setSelection(current => current?.type === "filter" ? { ...current, total: Math.max(current.excludedIds.size, current.total - result.deleted) } : current);
        hasMore = result.hasMore === true;
        if (hasMore && result.deleted === 0) throw new Error("Deletion made no progress");
      } while (hasMore && mounted.current);
      if (!mounted.current) return;
      toast.success("Selected Submissions deleted");
      setDeleteOpen(false);
      setSelection(null);
      submissions.refresh();
      if (page !== 1) navigation.go(submissionPath({ ...linkFilters, size: String(size), tagId: tagIds }));
    } catch {
      setDeleteError(
        "Deletion interrupted. Some Submissions could not be deleted. Retry to delete the remaining selection.",
      );
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  const selectableRecords = submissionData.items.filter(record =>
    (record.state === undefined || record.state === "completed") &&
    (selection?.type !== "filter" || record.createdAt < selection.snapshotBefore));
  const pageSelectedCount = selectableRecords.filter(record => isSubmissionSelected(selection, record.id)).length;
  const allOnPageSelected = selectableRecords.length > 0 && pageSelectedCount === selectableRecords.length;

  const selectAllControl = selection?.type !== "filter" && (allOnPageSelected || selectableRecords.length === 0) && deletableTotal > selectedCount ? (
        <Button variant="subtle" size="compact-sm" h={{ base: 44, md: 28 }} disabled={deleting || submissions.loading}
          onClick={() => setSelection(selectAllMatchingSubmissions(
            { ...collectionFilter(), state: "completed" }, deletableTotal,
            submissionData.snapshotBefore ?? new Date().toISOString(),
          ))}>
          Select all {deletableTotal.toLocaleString("en-US")}
        </Button>
      ) : null;

  const bulkActions = (
    <Group gap="xs" wrap="wrap">
      <Text size="sm" aria-live="polite">
        {selectedCount.toLocaleString("en-US")} selected
      </Text>
      {selectAllControl}
      <Group gap="xs" wrap="wrap">
        <Button
          type="button"
          color="red"
          size="compact-sm"
          h={{ base: 44, md: 28 }}
          disabled={deleting || submissions.loading}
          onClick={() => {
            setDeleteError(null);
            setDeletedCount(0);
            setDeleteTarget(selectedCount);
            setDeleteOpen(true);
          }}
        >
          Delete selected
        </Button>
        <Button
          type="button"
          variant="subtle"
          color="gray"
          size="compact-sm"
          h={{ base: 44, md: 28 }}
          disabled={deleting || submissions.loading}
          onClick={() => {
            setSelection(clearSubmissionSelection());
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLInputElement>(
                  'input[aria-label="Select submissions on this page"]',
                )
                ?.focus(),
            );
          }}
        >
          Clear
        </Button>
      </Group>
    </Group>
  );

  return (
    <PageWorkspace width="collection">
      {header()}
      <AdminResourceNotice resources={[submissions, sources, tags]} />
      <SubmissionFilters
        sources={sources.data}
        key={queryString({ ...linkFilters, search: undefined, tagId: tagIds })}
        searchSuspended={suspendedSearchKey === filtersKey}
        onSearchDraft={handleSearchDraft}
        onSearch={(search) =>
          navigation.go(
            submissionPath({
              ...linkFilters,
              search: search || undefined,
              size: String(size),
              tagId: tagIds,
            }),
            { replace: true },
          )
        }
        onSubmit={applyFilters}
        value={filters}
        extraActiveCount={period ? 1 : 0}
        hasTagFilters={tagIds.length > 0}
        tags={
          <TagFilter
            selectedTagIds={tagIds}
            showClearAction
            tags={tags.data}
            onSelectedTagIdsChange={(nextTagIds) =>
              navigateFilters({
                ...linkFilters,
                size: String(size),
                tagId: nextTagIds,
                search: searchDraft.trim() || undefined,
              })
            }
          />
        }
      />
      <ActiveFilterChips
        chips={[
          ...Object.entries(filters)
            .filter(([key, value]) => key !== "search" && Boolean(value))
            .map(([key, value]) => ({
              id: key,
              label:
                ({
                  sourceId: "Source",
                  search: "Search",
                  type: "Type",
                  state: "State",
                  from: "From",
                  to: "To",
                }[key] ?? key) +
                ": " +
                (key === "sourceId"
                  ? (sources.data?.find((source) => source.id === value)
                      ?.name ?? value)
                  : key === "type" || key === "state"
                    ? ({
                        "one-shot": "One-shot",
                        session: "Session",
                        draft: "Draft",
                        completed: "Completed",
                        expired: "Expired",
                      }[value ?? ""] ?? value)
                    : value),
              onRemove: () =>
                navigateFilters({
                  ...linkFilters,
                  [key]: undefined,
                  search: searchDraft.trim() || undefined,
                  size: String(size),
                  tagId: tagIds,
                }),
            })),
          ...(period
            ? [
                {
                  id: "period",
                  label: "Received: Last 24 hours",
                  onRemove: () =>
                    navigateFilters({
                      ...filters,
                      search: searchDraft.trim() || undefined,
                      size: String(size),
                      tagId: tagIds,
                    }),
                },
              ]
            : []),
        ]}
      />
      {submissions.loading && !submissions.data ? (
        <CollectionSkeleton label="Loading Submissions" />
      ) : submissions.error ? (
        <PageState
          title="Submissions could not be loaded"
          variant="error"
          action={<Button onClick={submissions.refresh}>Try again</Button>}
        />
      ) : (
        <>
          {deletableTotal < submissionData.total ? (
            <Text size="sm" c="dimmed">
              Only completed Submissions can be selected for deletion.
            </Text>
          ) : null}
          {submissionData.items.length === 0 ? (
            <CollectionEmptyState
              records="Submissions"
              action={filters.sourceId
                ? sources.data.find(source => source.id === filters.sourceId)
                  ? <Button variant="default" component={AppLink} href={"/app/sources/" + encodeURIComponent(sources.data.find(source => source.id === filters.sourceId)!.sourceId)}>Open Source</Button>
                  : <Button variant="default" component={AppLink} href="/app/sources">View Sources</Button>
                : sources.data.length === 0
                  ? <CreateSourceDialog trigger={<Button variant="default">Create Source</Button>} />
                  : <Button variant="default" component={AppLink} href="/app/sources">View Sources</Button>}
              filteredAction={<Button variant="default" onClick={() => navigateFilters({ sourceId: filters.sourceId, size: String(size) })}>Clear filters</Button>}
              sourceId={filters.sourceId}
              filtered={Boolean(
                period ||
                tagIds.length ||
                Object.entries(filters).some(
                  ([key, value]) => key !== "sourceId" && value,
                ),
              )}
            >
              Submissions will appear here after a Source receives data.
            </CollectionEmptyState>
          ) : (
            <Paper withBorder radius="md" w="100%" maw="100%" miw={0} aria-busy={pending} pos="relative" style={{ overflow: "hidden" }}>
              <Box ref={setTopControls} px="md" py="xs" />
              <Divider />
              <DataTable
                aria-label="Submissions"
                highlightOnHover
                horizontalSpacing="md"
                verticalSpacing="xs"
                minHeight={150}
                selectionColumnStyle={{ width: 44, minWidth: 44 }}
                pinLastColumn
                styles={{ table: { tableLayout: "fixed", width: "100%", minWidth: submissionWidths.totalWidth } }}
                records={submissionData.items}
                idAccessor="id"
                columns={[
                  ...submissionTableColumns().map((column) => ({
                    accessor: column.id,
                    title: column.label,
                    width: submissionWidths.displayWidth(column),
                    render: column.render,
                  })),
                  {
                    accessor: "actions",
                    title: <VisuallyHidden>Actions</VisuallyHidden>,
                    width: 64,
                    render: (submission) => (
                      <SubmissionRowActions
                        returnTo={returnTo}
                        submission={submission}
                        onDeleted={() => {
                          setSelection(null);
                          submissions.refresh();
                        }}
                      />
                    ),
                  },
                ]}
                onRowClick={({ record, event }) => {
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  if (!event.currentTarget.contains(event.target as Node))
                    return;
                  if (
                    (event.target as Element).closest(
                      'a, button, input, select, textarea, label, [role="button"], [role="checkbox"]',
                    )
                  )
                    return;
                  if (window.getSelection()?.toString()) return;
                  navigation.go(submissionDetailPath(record.id, returnTo));
                }}
                rowClassName="mantine-focus-auto"
                customRowAttributes={(record) => ({
                  tabIndex: 0,
                  onKeyDown: (
                    event: React.KeyboardEvent<HTMLTableRowElement>,
                  ) => {
                    if (
                      event.key === "Enter" &&
                      event.target === event.currentTarget &&
                      !event.ctrlKey &&
                      !event.metaKey &&
                      !event.altKey &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();
                      navigation.go(submissionDetailPath(record.id, returnTo));
                    }
                  },
                })}
                rowBackgroundColor={(record) =>
                  selectableRecords.some(item => item.id === record.id) && isSubmissionSelected(selection, record.id)
                    ? "var(--mantine-primary-color-light)"
                    : undefined
                }
                selectedRecords={selectableRecords.filter(record => isSubmissionSelected(selection, record.id))}
                isRecordSelectable={(record) => !deleting && !submissions.loading && selectableRecords.some(item => item.id === record.id)}
                getRecordSelectionCheckboxProps={(record) => ({
                  "aria-label": "Select submission " + record.id,
                })}
                onSelectedRecordsChange={(records) => {
                  const ids = new Set(records.map((record) => record.id));
                  setSelection((current) => {
                    let next = current;
                    for (const record of selectableRecords) {
                      if (
                        record.state !== undefined &&
                        record.state !== "completed"
                      )
                        continue;
                      if (
                        isSubmissionSelected(current, record.id) !==
                        ids.has(record.id)
                      )
                        next = selectSubmission(
                          next,
                          record.id,
                          ids.has(record.id),
                        );
                    }
                    return next;
                  });
                }}
                allRecordsSelectionCheckboxProps={{
                  "aria-label": "Select submissions on this page",
                  disabled: deleting || submissions.loading || selectableRecords.length === 0,
                  checked: allOnPageSelected,
                  indeterminate: pageSelectedCount > 0 && !allOnPageSelected,
                  onChange: (event) => {
                    const checked = event.currentTarget.checked;
                    setSelection(current => selectableRecords.reduce(
                      (next, record) => selectSubmission(next, record.id, checked), current,
                    ));
                  },
                }}
                page={page}
                recordsPerPage={size}
                totalRecords={submissionData.total}
                recordsPerPageOptions={[...PAGE_SIZES]}
                recordsPerPageLabel="Rows per page"
                onPageChange={(nextPage) =>
                  navigation.go(
                    submissionPath({
                      ...linkFilters,
                      page: String(nextPage),
                      size: String(size),
                      tagId: tagIds,
                    }),
                  )
                }
                onRecordsPerPageChange={(nextSize) =>
                  navigation.go(
                    submissionPath({
                      ...linkFilters,
                      size: String(nextSize),
                      tagId: tagIds,
                    }),
                  )
                }
                paginationText={({ from, to, totalRecords }) =>
                  from + "–" + to + " of " + totalRecords
                }
                getPaginationControlProps={(control) => ({
                  "aria-label": {
                    first: "First page",
                    last: "Last page",
                    previous: "Previous page",
                    next: "Next page",
                  }[control],
                })}
                renderPagination={({ Controls }) => {
                  const controls = (position: "Top" | "Bottom") => (
                    <Group
                      role="group"
                      aria-label={position + " table controls"}
                      justify="space-between"
                      gap="sm"
                      mih={44}
                      w="100%"
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Controls.PageSizeSelector />
                        <Box w={16} h={16}>
                          {position === "Top" && pending && showLoading
                            ? <Loader size={16} aria-label="Updating Submissions" />
                            : null}
                        </Box>
                      </Group>
                      {selectedCount > 0 ? bulkActions : <Group gap="xs"><Controls.Text />{selectAllControl}</Group>}
                      <Controls.Pagination boundaries={1} siblings={1} />
                    </Group>
                  );
                  return (
                    <>
                      {topControls
                        ? createPortal(controls("Top"), topControls)
                        : null}
                      {controls("Bottom")}
                    </>
                  );
                }}
              />
            </Paper>
          )}
        </>
      )}
      <ConfirmDialog
        opened={deleteOpen}
        title={"Delete " + (deleting ? deleteTarget : selectedCount).toLocaleString("en-US") + " Submissions permanently?"}
        confirmLabel="Delete selected"
        pendingLabel="Deleting…"
        pending={deleting}
        error={deleteError}
        size="sm"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void removeSelected()}
      >
        {selection?.type === "filter" ? (
          <Text size="sm" mb="sm">Delete the selected results matching these filters{filters.sourceId ? " for " + (sources.data.find(source => source.id === filters.sourceId)?.name ?? "this Source") : ""}. New arrivals are excluded.</Text>
        ) : null}
        This action cannot be undone.
        {deleting ? <Text size="sm" mt="sm">Keep this page open until deletion finishes.</Text> : null}
        {deleting || deletedCount > 0 ? (
          <Box mt="md" role="status">
            <Text size="sm">{deletedCount.toLocaleString("en-US")} deleted</Text>
            {deleting ? <Progress animated value={Math.min(100, deletedCount / Math.max(1, deletedCount + selectedCount) * 100)} mt="xs" aria-label="Deletion progress" /> : null}
          </Box>
        ) : null}
      </ConfirmDialog>
    </PageWorkspace>
  );
}
