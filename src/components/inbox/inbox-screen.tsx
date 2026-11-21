"use client";
import { ActiveFilterChips } from "@/components/patterns/active-filter-chips";
import { parsePageSize as normalizePageSize } from "@/shared/pagination";

import { EditorTabList } from "@/components/patterns/editor-tab-list";
import { localDateParameters } from "@/client/local-date-filters";

import { Badge, Button, Group, Stack, Tabs } from "@mantine/core";
import { Download } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  bulkUpdateInbox,
  selectAllInbox,
  listInbox,
  updateInboxItem,
  type InboxAction,
} from "@/client/admin-api/inbox";
import { listSources, listTags } from "@/client/admin-api/sources";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import { CollectionSkeleton } from "@/components/patterns/collection-skeleton";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { useDateRangeError } from "@/components/patterns/date-range-filter";
import { PageHeader } from "@/components/patterns/page-header";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";

import {
  InboxFilters,
  type InboxFilterDraft,
} from "@/components/inbox/inbox-filters";
import { InboxRecords } from "@/components/inbox/inbox-records";
import { TagFilter } from "@/components/tags/tag-filter";
import type { AdminTag } from "@/shared/contracts/admin";
import {
  inboxActionMessages,
  notifyInboxChanged,
  showTrashUndo,
} from "@/components/inbox/inbox-actions";

export type InboxScreenQuery = {
  from?: string;
  page?: string;
  search?: string;
  size?: string;
  sourceId?: string;
  state?: string;
  tagId?: string | string[];
  to?: string;
  view?: string;
};

type InboxQueryState = {
  from: string;
  page: number;
  search: string;
  size: 10 | 50 | 100;
  sourceId: string;
  state: string;
  tagIds: string[];
  to: string;
  trash: boolean;
};

function queryPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function querySize(value: string | undefined): 10 | 50 | 100 {
  return normalizePageSize(value);
}

function queryTagIds(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.filter(Boolean))];
}

function inboxQueryState(query: InboxScreenQuery = {}): InboxQueryState {
  return {
    from: query.from || "",
    page: queryPage(query.page),
    search: query.search || "",
    size: querySize(query.size),
    sourceId: query.sourceId || "all",
    state: query.state || "all",
    tagIds: queryTagIds(query.tagId),
    to: query.to || "",
    trash: query.view === "trash",
  };
}

function inboxPath(value: InboxQueryState) {
  const parameters = new URLSearchParams();
  if (value.trash) parameters.set("view", "trash");
  for (const tagId of value.tagIds) parameters.append("tagId", tagId);
  if (value.sourceId !== "all") parameters.set("sourceId", value.sourceId);
  if (!value.trash && value.state !== "all")
    parameters.set("state", value.state);
  if (value.search) parameters.set("search", value.search);
  if (value.from) parameters.set("from", value.from);
  if (value.to) parameters.set("to", value.to);
  if (value.page > 1) parameters.set("page", String(value.page));
  if (value.size !== 10) parameters.set("size", String(value.size));
  const query = parameters.toString();
  return query ? `/app/inbox?${query}` : "/app/inbox";
}

function InboxScreenContent({
  initialQuery,
}: {
  initialQuery?: InboxScreenQuery;
}) {
  const navigation = useAppNavigation();
  const initialState = inboxQueryState(initialQuery);
  const [localTrash, setLocalTrash] = useState(initialState.trash);
  const [localTagIds, setLocalTagIds] = useState(initialState.tagIds);
  const [localPage, setLocalPage] = useState(initialState.page);
  const [localPageSize, setLocalPageSize] = useState<10 | 50 | 100>(
    initialState.size,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const selectionScopeRef = useRef("");
  const mutationPending = useRef(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState("");
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [localSourceId, setLocalSourceId] = useState(initialState.sourceId);
  const [localState, setLocalState] = useState(initialState.state);
  const [draft, setDraft] = useState<InboxFilterDraft>({
    from: initialState.from,
    search: initialState.search,
    sourceId: initialState.sourceId,
    state: initialState.state,
    to: initialState.to,
  });
  const dateRange = useDateRangeError();
  const [textFilters, setTextFilters] = useState({
    from: initialState.from,
    search: initialState.search,
    to: initialState.to,
  });
  const urlControlled = Boolean(initialQuery);
  const queryState = initialState;
  const trash = urlControlled ? queryState.trash : localTrash;
  const tagIds = urlControlled ? queryState.tagIds : localTagIds;
  const page = urlControlled ? queryState.page : localPage;
  const pageSize = urlControlled ? queryState.size : localPageSize;
  const sourceId = urlControlled ? queryState.sourceId : localSourceId;
  const state = urlControlled ? queryState.state : localState;
  const activeTextFilters = urlControlled
    ? { from: queryState.from, search: queryState.search, to: queryState.to }
    : textFilters;

  const filterScope = JSON.stringify([
    activeTextFilters.from,
    activeTextFilters.to,
    activeTextFilters.search,
    sourceId,
    state,
    tagIds,
    trash,
  ]);
  const [previousScope, setPreviousScope] = useState(filterScope);
  if (previousScope !== filterScope) {
    setPreviousScope(filterScope);
    setSelected([]);
    setDraft({ ...activeTextFilters, sourceId, state });
  }
  useEffect(() => { selectionScopeRef.current = filterScope; }, [filterScope]);

  function changeQuery(next: Partial<InboxQueryState>) {
    const current: InboxQueryState = {
      from: activeTextFilters.from,
      page,
      search: activeTextFilters.search,
      size: pageSize,
      sourceId,
      state,
      tagIds,
      to: activeTextFilters.to,
      trash,
    };
    const updated = { ...current, ...next };
    if (Object.keys(next).some((key) => key !== "page" && key !== "size"))
      setSelected([]);
    if (urlControlled) {
      navigation.go(inboxPath(updated));
      return;
    }
    setLocalTrash(updated.trash);
    setLocalTagIds(updated.tagIds);
    setLocalPage(updated.page);
    setLocalPageSize(updated.size);
    setLocalSourceId(updated.sourceId);
    setLocalState(updated.state);
    setTextFilters({
      from: updated.from,
      search: updated.search,
      to: updated.to,
    });
  }
  const [sources, setSources] = useState<
    Awaited<ReturnType<typeof listSources>>
  >([]);
  useEffect(() => {
    void Promise.all([listTags(), listSources()])
      .then(([nextTags, nextSources]) => {
        setTags(nextTags);
        setSources(nextSources);
      })
      .catch(() => undefined);
  }, []);
  const filterParameters = new URLSearchParams();
  if (trash) filterParameters.set("view", "trash");
  for (const tagId of tagIds) filterParameters.append("tagId", tagId);
  if (sourceId !== "all") filterParameters.set("sourceId", sourceId);
  if (!trash && state !== "all") filterParameters.set("state", state);
  if (activeTextFilters.search)
    filterParameters.set("search", activeTextFilters.search);
  if (activeTextFilters.from)
    filterParameters.set("from", activeTextFilters.from);
  if (activeTextFilters.to) filterParameters.set("to", activeTextFilters.to);
  const exportQuery = localDateParameters(filterParameters).toString();
  const exportPath = `/api/admin/v1/inbox/export${exportQuery ? `?${exportQuery}` : ""}`;
  const listParameters = new URLSearchParams(filterParameters);
  listParameters.set("page", String(page));
  listParameters.set("limit", String(pageSize));
  const query = `?${listParameters.toString()}`;
  const resource = useAdminResource(() => listInbox(query), `inbox:${query}`, {
    policy: "ambient",
    keepPreviousData: true,
  });
  const returnPath = inboxPath({
    ...activeTextFilters,
    page,
    size: pageSize,
    sourceId,
    state,
    tagIds,
    trash,
  });
  const detailPath = (id: string) =>
    `/app/inbox/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(returnPath)}`;
  const refreshResource = resource.refresh;
  const lastPage = Math.max(
    1,
    Math.ceil((resource.data?.total ?? 0) / pageSize),
  );
  const pageOutOfRange = Boolean(
    resource.data && !resource.loading && !resource.error && page > lastPage,
  );
  if (!urlControlled && pageOutOfRange) setLocalPage(lastPage);
  const correctedPath =
    urlControlled && pageOutOfRange
      ? inboxPath({ ...queryState, page: lastPage })
      : null;
  const redirectingTo = useRef<string | null>(null);
  useEffect(() => {
    if (correctedPath && redirectingTo.current !== correctedPath) {
      redirectingTo.current = correctedPath;
      navigation.go(correctedPath);
    } else if (!correctedPath) redirectingTo.current = null;
  }, [correctedPath, navigation]);
  useEffect(() => {
    const changed = () => refreshResource();
    window.addEventListener("forman:inbox-updated", changed);
    return () => window.removeEventListener("forman:inbox-updated", changed);
  }, [refreshResource]);
  const refresh = () => {
    setSelected([]);
    resource.refresh();
  };
  async function move(ids: string[], action: InboxAction) {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setPending(true);
    let completed = 0;
    try {
      if (ids.length === 1) await updateInboxItem(ids[0], action);
      else {
        for (let offset = 0; offset < ids.length; offset += 100) {
          const batch = ids.slice(offset, offset + 100);
          await bulkUpdateInbox(batch, action);
          completed += batch.length;
          setSelected((current) => current.filter((id) => !batch.includes(id)));
          if (action === "delete")
            setDeleteIds(ids.slice(offset + batch.length));
          setProgress(Math.min(offset + 100, ids.length) + " / " + ids.length);
        }
      }
      if (action === "trash") showTrashUndo(ids);
      else toast.success(inboxActionMessages[action]);
      if (action === "delete") {
        setDeleteIds([]);
        notifyInboxChanged();
      }
      refresh();
      return true;
    } catch {
      if (completed > 0) {
        resource.refresh();
        if (action === "trash") showTrashUndo(ids.slice(0, completed));
        toast.error(
          completed +
            " completed; " +
            (ids.length - completed) +
            " remain selected",
        );
      }
      if (action === "delete")
        setDeleteError("The Inbox items could not be deleted. Try again.");
      else toast.error("The Inbox items could not be updated.");
      return false;
    } finally {
      setProgress("");
      mutationPending.current = false;
      setPending(false);
    }
  }
  async function emptyTrash() {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setPending(true);
    try {
      await bulkUpdateInbox([], "empty-trash");
      setEmptyTrashOpen(false);
      toast.success("Trash emptied");
      notifyInboxChanged();
      refresh();
    } catch {
      toast.error("Trash could not be emptied.");
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  }
  const changeView = (value: string) => {
    changeQuery({ page: 1, trash: value === "trash" });
  };
  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dateRange.check(event.currentTarget, draft.from, draft.to))
      return false;
    changeQuery({
      from: draft.from,
      page: 1,
      search: draft.search.trim(),
      sourceId: draft.sourceId,
      state: draft.state,
      to: draft.to,
    });
  };
  const emptyDraft: InboxFilterDraft = {
    from: "",
    search: "",
    sourceId: "all",
    state: "all",
    to: "",
  };
  const resetFilters = () => {
    setDraft({ ...emptyDraft, search: activeTextFilters.search });
    dateRange.clear();
    changeQuery({ ...emptyDraft, search: activeTextFilters.search, page: 1 });
  };
  const hasFilters = Boolean(
    draft.from ||
    draft.to ||
    draft.sourceId !== "all" ||
    draft.state !== "all" ||
    activeTextFilters.from ||
    activeTextFilters.to ||
    sourceId !== "all" ||
    state !== "all",
  );
  const header = (
    <PageHeader
      title="Inbox"
      actions={
        <>
          {trash && !(resource.data?.hasTrash === false && !resource.loading && !resource.error) ? (
            <Button
              disabled={pending || resource.loading || Boolean(resource.error) || !resource.data?.hasTrash}
              onClick={() => setEmptyTrashOpen(true)}
              type="button"
              variant="light"
              color="red"
            >
              Empty Trash
            </Button>
          ) : null}
          <Button
            component={AppLink}
            href={exportPath}
            variant="default"
            leftSection={<Download size={16} aria-hidden="true" />}
          >
            Export CSV
          </Button>
        </>
      }
    />
  );
  const renderPage = (content: ReactNode, navigationReady = true) => (
    <PageWorkspace navigationReady={navigationReady} width="collection">
      <Stack gap="lg" miw={0}>
        {header}
        <Tabs
          onChange={(value) => {
            if (value) changeView(value);
          }}
          value={trash ? "trash" : "inbox"}
        >
          <EditorTabList label="Inbox view" spaced={false}>
            <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
            <Tabs.Tab value="trash">Trash</Tabs.Tab>
          </EditorTabList>
        </Tabs>
        <AdminResourceNotice resource={resource} />
        {content}
      </Stack>
    </PageWorkspace>
  );
  if (resource.loading && !resource.data)
    return renderPage(<CollectionSkeleton label="Loading Inbox" />, false);
  if (resource.error || !resource.data)
    return renderPage(
      <PageState
        action={
          <Button onClick={resource.refresh} type="button">
            Try again
          </Button>
        }
        title="Inbox could not be loaded"
        variant="error"
      />,
    );
  const { items, total } = resource.data;
  async function selectMatching() {
    if (selectionLoading || pending || resource.loading) return;
    const scope = filterScope;
    setSelectionLoading(true);
    try {
      const result = await selectAllInbox(query);
      if (scope === selectionScopeRef.current) setSelected(result.ids);
    } catch {
      toast.error("Selection could not be loaded");
    } finally {
      setSelectionLoading(false);
    }
  }
  return renderPage(
    <>
      <InboxFilters
        tags={
          <TagFilter
            onSelectedTagIdsChange={(next) =>
              changeQuery({ page: 1, tagIds: next })
            }
            selectedTagIds={tagIds}
            showClearAction
            tags={tags}
          />
        }
        search={activeTextFilters.search}
        onSearch={(search) => {
          setDraft((current) => ({ ...current, search }));
          changeQuery({ search, page: 1 });
        }}
        activeCount={
          [
            activeTextFilters.from,
            activeTextFilters.to,
            sourceId !== "all",
            !trash && state !== "all",
          ].filter(Boolean).length
        }
        dateError={dateRange.error}
        draft={draft}
        hasFilters={hasFilters}
        sources={sources}
        trash={trash}
        onChange={setDraft}
        onDateEdit={dateRange.clear}
        onReset={resetFilters}
        onSubmit={applyFilters}
      />
      <ActiveFilterChips
        chips={[
          {
            id: "source",
            label:
              "Source: " +
              (sources.find((source) => source.id === sourceId)?.name ??
                sourceId),
            active: sourceId !== "all",
            onRemove: () => changeQuery({ sourceId: "all", page: 1 }),
          },
          {
            id: "state",
            label: "State: " + state,
            active: state !== "all" && !trash,
            onRemove: () => changeQuery({ state: "all", page: 1 }),
          },
          {
            id: "from",
            label: "From: " + activeTextFilters.from,
            active: Boolean(activeTextFilters.from),
            onRemove: () => changeQuery({ from: "", page: 1 }),
          },
          {
            id: "to",
            label: "To: " + activeTextFilters.to,
            active: Boolean(activeTextFilters.to),
            onRemove: () => changeQuery({ to: "", page: 1 }),
          },
        ].filter((chip) => chip.active)}
      />
      {items.length ? (
        <>
          <InboxRecords
            pagination={{
              page: page,
              pageSize: pageSize,
              total: total,
              onPageChange: (nextPage) => changeQuery({ page: nextPage }),
              onPageSizeChange: (value) =>
                changeQuery({ page: 1, size: value as 10 | 50 | 100 }),
            }}
            bulkActions={
              selected.length ? (
                <Group gap="sm" role="group" aria-label="Selected item actions">
                  <Badge variant="light" size="lg">
                    {progress || selected.length + " selected"}
                  </Badge>
                  {items.every((item) => selected.includes(item.id)) &&
                  total > selected.length ? (
                    <Button
                      variant="subtle"
                      loading={selectionLoading}
                      disabled={pending || resource.loading || selectionLoading}
                      onClick={() => void selectMatching()}
                    >
                      Select all {total}
                    </Button>
                  ) : null}
                  {!trash ? (
                    <>
                      <Button
                        disabled={
                          pending || resource.loading || selectionLoading
                        }
                        onClick={() => void move(selected, "read")}
                        type="button"
                        variant="default"
                      >
                        Mark as read
                      </Button>
                      <Button
                        disabled={
                          pending || resource.loading || selectionLoading
                        }
                        onClick={() => void move(selected, "unread")}
                        type="button"
                        variant="default"
                      >
                        Mark as unread
                      </Button>
                      <Button
                        disabled={
                          pending || resource.loading || selectionLoading
                        }
                        onClick={() => void move(selected, "archive")}
                        type="button"
                        variant="default"
                      >
                        Archive
                      </Button>
                      {items.some(
                        (item) =>
                          selected.includes(item.id) &&
                          item.state === "archived",
                      ) ? (
                        <Button
                          disabled={
                            pending || resource.loading || selectionLoading
                          }
                          onClick={() => void move(selected, "unarchive")}
                          type="button"
                          variant="default"
                        >
                          Move to Inbox
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  <Button
                    disabled={pending || resource.loading || selectionLoading}
                    onClick={() =>
                      void move(selected, trash ? "restore" : "trash")
                    }
                    type="button"
                    variant={trash ? "default" : "light"}
                    color={trash ? undefined : "red"}
                  >
                    {trash ? "Restore selected" : "Move to Trash"}
                  </Button>
                  {trash ? (
                    <Button
                      color="red"
                      variant="light"
                      disabled={pending || resource.loading || selectionLoading}
                      onClick={() => {
                        setDeleteError("");
                        setDeleteIds([...selected]);
                      }}
                    >
                      Delete permanently
                    </Button>
                  ) : null}
                  <Button
                    variant="default"
                    disabled={pending || resource.loading || selectionLoading}
                    onClick={() => setSelected([])}
                  >
                    Clear selection
                  </Button>
                </Group>
              ) : null
            }
            items={items}
            selected={selected}
            pending={pending || resource.loading}
            trash={trash}
            detailPath={detailPath}
            onOpen={(id) => navigation.go(detailPath(id))}
            onSelectionChange={setSelected}
            onAction={(id, action) => {
              if (action === "delete") {
                setDeleteError("");
                setDeleteIds([id]);
              } else void move([id], action);
            }}
          />
        </>
      ) : (
        <CollectionEmptyState
          sourceHref={sources.find(source => source.id === sourceId) ? "/app/sources/" + encodeURIComponent(sources.find(source => source.id === sourceId)!.sourceId) : undefined}
          records={trash ? "Inbox items in Trash" : "Inbox items"}
          title={trash ? "Trash is empty" : "Inbox is empty"}
          sourceId={sourceId === "all" ? undefined : sourceId}
          filtered={Boolean(
            tagIds.length ||
            state !== "all" ||
            activeTextFilters.search ||
            activeTextFilters.from ||
            activeTextFilters.to,
          )}
        >
          {trash
            ? null
            : "Submissions will appear here when processed by an Inbox Action."}
        </CollectionEmptyState>
      )}
      <ConfirmDialog
        opened={deleteIds.length > 0}
        title={
          deleteIds.length === 1 ? "Delete Inbox item?" : "Delete Inbox items?"
        }
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        pending={pending}
        error={deleteError}
        onCancel={() => setDeleteIds([])}
        onConfirm={() => void move(deleteIds, "delete")}
      >
        Permanently deletes{" "}
        {deleteIds.length === 1
          ? "this Inbox item"
          : `${deleteIds.length} selected Inbox items`}{" "}
        still in Trash. Linked Submissions and Pipeline Runs are kept. This
        action cannot be undone.
      </ConfirmDialog>
      <ConfirmDialog
        opened={emptyTrashOpen}
        title="Empty Trash?"
        confirmLabel="Empty Trash"
        pendingLabel="Emptying…"
        pending={pending}
        onCancel={() => setEmptyTrashOpen(false)}
        onConfirm={() => void emptyTrash()}
      >
        Permanently deletes all Trash items, including those hidden by filters.
      </ConfirmDialog>
    </>,
  );
}

export function InboxScreen({
  initialQuery,
}: {
  initialQuery?: InboxScreenQuery;
}) {
  return <InboxScreenContent initialQuery={initialQuery} />;
}
