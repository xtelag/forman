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

import { Text } from "@mantine/core";

import { ActiveFilterChips } from "@/components/patterns/active-filter-chips";
import { RowNavigationItems } from "@/components/patterns/row-navigation-items";

import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

import { discardUnsavedChanges } from "@/client/use-unsaved-changes";
import { deletePage, setPagePublished } from "@/client/admin-api/pages";
import type { AdminPageSummary, AdminTag } from "@/shared/contracts/admin";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";
import { PageState } from "@/components/patterns/page-state";
import { ResourceTable } from "@/components/patterns/resource-table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { TagList } from "@/components/tags/tag-list";
import { matchesSelectedTags, TagFilter } from "@/components/tags/tag-filter";
import { Menu, VisuallyHidden } from "@mantine/core";
import { LocalDateTime } from "@/components/patterns/local-date-time";

export type PagesListQuery = {
  sourceId?: string;
  search?: string;
  page?: string;
  size?: string;
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

export function PageRowActions({
  onDeleted,
  onChanged = onDeleted,
  detail = false,
  page,
}: {
  onDeleted: () => void;
  onChanged?: () => void;
  detail?: boolean;
  page: AdminPageSummary & { fields?: unknown[] };
}) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [unpublish, setUnpublish] = useState(false);
  const busy = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function removePage() {
    if (busy.current) return;
    busy.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await deletePage(page.pageId);
      if (!alive.current) return;
      setConfirmDelete(false);
      if (detail) discardUnsavedChanges();
      onDeleted();
    } catch {
      if (!alive.current) return;
      setDeleteError("The Built-in Form could not be deleted. Try again.");
    } finally {
      busy.current = false;
      if (alive.current) setDeleting(false);
    }
  }

  async function publish(enabled: boolean) {
    if (busy.current) return;
    busy.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await setPagePublished(page.pageId, enabled);
      if (!alive.current) return;
      setUnpublish(false);
      toast.success(
        enabled ? "Built-in Form published" : "Built-in Form unpublished",
      );
      onChanged();
    } catch {
      if (!alive.current) return;
      const message =
        "The publication state could not be updated. Check the form configuration and try again.";
      setDeleteError(message);
      if (enabled) toast.error(message);
    } finally {
      busy.current = false;
      if (alive.current) setDeleting(false);
    }
  }
  return (
    <>
      <RowActionsMenu
        detail={detail}
        label={
          detail
            ? "Built-in Form actions"
            : "Actions for Built-in Form " + page.name
        }
        disabled={deleting}
        triggerRef={triggerRef}
      >
        {!detail ? (
          <>
            <RowNavigationItems
              items={[
                {
                  label: "Open Built-in Form",
                  href: "/app/pages/" + encodeURIComponent(page.pageId),
                },
              ]}
            />
            <Menu.Divider />
          </>
        ) : null}
        <Menu.Item
          component={AppLink}
          href={"/app/preview/" + encodeURIComponent(page.pageId)}
          rel="noopener noreferrer"
          target="_blank"
          disabled={detail && !page.fields?.length}
        >
          Preview form
        </Menu.Item>
        <Menu.Item
          component="a"
          href={
            page.enabled && page.sourceEnabled !== false
              ? page.publicUrl
              : undefined
          }
          target="_blank"
          rel="noopener noreferrer"
          disabled={!page.enabled || page.sourceEnabled === false}
          aria-disabled={!page.enabled || page.sourceEnabled === false}
        >
          Open public form
        </Menu.Item>
        {page.sourceEnabled === false ? (
          <Text size="xs" c="dimmed" px="sm">
            Activate the Source to open the public form.
          </Text>
        ) : null}
        <Menu.Item
          onClick={() =>
            void navigator.clipboard.writeText(page.publicUrl).then(
              () => toast.success("Public URL copied"),
              () => toast.error("The URL could not be copied. Try again."),
            )
          }
        >
          Copy public URL
        </Menu.Item>
        <Menu.Divider />
        <RowNavigationItems
          items={[
            {
              label: "View Source Submissions",
              href:
                "/app/submissions?sourceId=" +
                encodeURIComponent(page.sourceId),
            },
            {
              label: "Open Source",
              href: "/app/sources/" + encodeURIComponent(page.sourcePublicId),
            },
          ]}
        />

        <Menu.Divider />
        <Menu.Item
          disabled={deleting}
          onClick={() => {
            setDeleteError("");
            if (page.enabled) setUnpublish(true);
            else void publish(true);
          }}
        >
          {page.enabled ? "Unpublish" : "Publish"}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          onClick={() => {
            setDeleteError("");
            setConfirmDelete(true);
          }}
        >
          Delete permanently
        </Menu.Item>
      </RowActionsMenu>
      <ConfirmDialog
        opened={unpublish}
        title="Unpublish Built-in Form?"
        confirmLabel="Unpublish"
        pendingLabel="Unpublishing…"
        pending={deleting}
        error={deleteError}
        returnFocusTo={triggerRef}
        onCancel={() => setUnpublish(false)}
        onConfirm={() => void publish(false)}
      >
        The public form will be unavailable until published again.
      </ConfirmDialog>
      <ConfirmDialog
        opened={confirmDelete}
        title="Delete Built-in Form?"
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        pending={deleting}
        error={deleteError}
        returnFocusTo={triggerRef}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void removePage()}
      >
        <strong style={{ overflowWrap: "anywhere" }}>{page.name}</strong>
        <p style={{ marginBottom: 0 }}>
          The public form and its QR address will stop working. The Source
          remains unchanged.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function PagesList({
  initialQuery,
  onDeleted,
  onQueryChange,
  pages,
  tags,
}: {
  initialQuery?: PagesListQuery;
  onDeleted: () => void;
  onQueryChange?: (
    query: Required<Omit<PagesListQuery, "sourceId">> &
      Pick<PagesListQuery, "sourceId">,
  ) => void;
  pages: AdminPageSummary[];
  tags: AdminTag[];
}) {
  const navigation = useAppNavigation();
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState<10 | 50 | 100>(10);
  const [localTagIds, setLocalTagIds] = useState<string[]>([]);
  const urlControlled = Boolean(onQueryChange);
  const [localSearch, setLocalSearch] = useState("");
  const search = urlControlled ? (initialQuery?.search ?? "") : localSearch;
  const sourceId = initialQuery?.sourceId;
  const page = urlControlled ? pageNumber(initialQuery?.page) : localPage;
  const pageSize = urlControlled
    ? parsePageSize(initialQuery?.size)
    : localPageSize;
  const tagIds = urlControlled
    ? tagIdsFromQuery(initialQuery?.tagId)
    : localTagIds;
  const [bulkPending, setBulkPending] = useState(false);
  const selection = useCollectionSelection({
    items: pages,
    getId: (item) => item.id,
    scope: JSON.stringify([search, sourceId, [...tagIds].sort()]),
  });

  function changeQuery(next: {
    search?: string;
    page: number;
    pageSize: 10 | 50 | 100;
    tagIds: string[];
    sourceId?: string | null;
  }) {
    if (onQueryChange) {
      onQueryChange({
        search: next.search ?? search,
        page: String(next.page),
        size: String(next.pageSize),
        tagId: next.tagIds,
        sourceId:
          next.sourceId === null ? undefined : (next.sourceId ?? sourceId),
      });
      return;
    }
    setLocalSearch(next.search ?? search);
    setLocalPage(next.page);
    setLocalPageSize(next.pageSize);
    setLocalTagIds(next.tagIds);
  }
  if (pages.length === 0 && !sourceId && !tagIds.length)
    return (
      <PageState title="No Built-in Forms yet" variant="empty">
        Create a Built-in Form from an existing Source.
      </PageState>
    );
  const filteredPages = pages.filter(
    (page) =>
      matchesSelectedTags(page.tags, tagIds) &&
      (page.name + " " + page.sourceName)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (!sourceId || page.sourceId === sourceId),
  );
  const pageCount = Math.max(1, Math.ceil(filteredPages.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filteredPages.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <>
      <FilterPanel
        formKey={sourceId ?? ""}
        label="Collection filters"
        activeCount={sourceId ? 1 : 0}
        onSubmit={(event) => {
          event.preventDefault();
          changeQuery({
            page: 1,
            pageSize,
            tagIds,
            sourceId:
              String(new FormData(event.currentTarget).get("sourceId") || "") ||
              null,
          });
        }}
        toolbar={
          <CollectionSearch
            value={search}
            onChange={(text) =>
              changeQuery({ page: 1, pageSize, tagIds, search: text })
            }
          />
        }
        tags={
          <TagFilter
            onSelectedTagIdsChange={(nextTagIds) => {
              changeQuery({ page: 1, pageSize, tagIds: nextTagIds });
            }}
            selectedTagIds={tagIds}
            showClearAction
            tags={tags}
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
                  pages
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
              pageSize: pageSize,
              tagIds: tagIds,
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
                    (pages.find((page) => page.sourceId === sourceId)
                      ?.sourceName ?? "Selected Source"),
                  onRemove: () =>
                    changeQuery({ page: 1, pageSize, tagIds, sourceId: null }),
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
        onChanged={onDeleted}
        onPendingChange={setBulkPending}
        actions={[
          {
            id: "publish",
            label: "Publish selected",
            description:
              "Publish these Built-in Forms. Each form must have a valid configuration.",
            run: (item) => setPagePublished(item.pageId, true),
          },
          {
            id: "unpublish",
            label: "Unpublish selected",
            description:
              "These public forms will be unavailable until published again.",
            run: (item) => setPagePublished(item.pageId, false),
          },
          {
            id: "delete",
            label: "Delete selected",
            destructive: true,
            description:
              "Permanently deletes these Built-in Forms. Their public and QR addresses will stop working. Sources and collected data remain unchanged.",
            run: (item) => deletePage(item.pageId),
          },
        ]}
        selectAll={
          selection.forPage(visible).allSelected === true
            ? {
                total: filteredPages.length,
                onClick: () => selection.selectAll(filteredPages),
              }
            : undefined
        }
      >
        {(bulkActions) => (
          <>
            {filteredPages.length ? (
              <>
                <ResourceTable
                  bulkActions={bulkActions}
                  pagination={{
                    onPageChange: (nextPage) =>
                      changeQuery({ page: nextPage, pageSize, tagIds }),
                    onPageSizeChange: (value) => {
                      changeQuery({
                        page: 1,
                        pageSize: value as 10 | 50 | 100,
                        tagIds,
                      });
                    },
                    page: currentPage,
                    pageSize: pageSize,
                    total: filteredPages.length,
                  }}
                  ariaLabel="Built-in Forms"
                  selection={selection.forPage(visible, bulkPending)}
                  columns={[
                    {
                      id: "name",
                      label: "Built-in Form",
                      render: (item) => (
                        <Text
                          size="sm"
                          fw={500}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {item.name}
                        </Text>
                      ),
                    },
                    {
                      id: "source",
                      label: "Source",
                      render: (item) => (
                        <span style={{ overflowWrap: "anywhere" }}>
                          {item.sourceName}
                        </span>
                      ),
                    },
                    {
                      id: "updated",
                      label: "Updated",
                      width: 176,
                      render: (item) => (
                        <LocalDateTime value={item.updatedAt} />
                      ),
                      sizing: "compact",
                    },
                    {
                      id: "status",
                      label: "Status",
                      width: 136,
                      render: (item) => (
                        <StatusBadge
                          status={item.enabled ? "success" : "inactive"}
                          subtle
                        >
                          {item.enabled ? "Published" : "Draft"}
                        </StatusBadge>
                      ),
                      sizing: "compact",
                    },
                    {
                      id: "tags",
                      label: "Tags",
                      width: 160,
                      render: (item) => <TagList tags={item.tags} />,
                    },
                    {
                      className: "text-right",
                      id: "actions",
                      label: <VisuallyHidden>Actions</VisuallyHidden>,
                      mobileAction: true,
                      mobileLabel: "Actions",
                      render: (item) => (
                        <PageRowActions onDeleted={onDeleted} page={item} />
                      ),
                      sizing: "action",
                    },
                  ]}
                  getRowKey={(item) => item.id}
                  items={visible}
                  onRowClick={(page) =>
                    navigation.go(`/app/pages/${page.pageId}`)
                  }
                />
              </>
            ) : (
              <CollectionEmptyState
                sourceHref={
                  pages.find((page) => page.sourceId === sourceId)
                    ? "/app/sources/" +
                      encodeURIComponent(
                        pages.find((page) => page.sourceId === sourceId)!
                          .sourcePublicId,
                      )
                    : undefined
                }
                records="Built-in Forms"
                sourceId={sourceId}
                filtered={tagIds.length > 0 || search.length > 0}
              />
            )}
          </>
        )}
      </CollectionBulkActions>
    </>
  );
}
