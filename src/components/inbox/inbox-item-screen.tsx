"use client";

import { Archive, ArchiveRestore, Trash2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getInboxItem,
  updateInboxItem,
  type InboxAction,
} from "@/client/admin-api/inbox";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { TagBadge } from "@/components/sources/source-tags-configuration";
import { InboxItemValues } from "@/components/inbox/inbox-item-values";
import {
  inboxActionMessages,
  inboxReturnPath,
  notifyInboxChanged,
  showTrashUndo,
} from "@/components/inbox/inbox-actions";
import { useAppNavigation } from "@/components/layout/app-link";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { RowNavigationItems } from "@/components/patterns/row-navigation-items";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import {
  Button,
  Group,
  Menu,
  Text,
  Tooltip,
} from "@mantine/core";
import { LocalDateTime } from "@/components/patterns/local-date-time";

export function InboxItemScreen({
  itemId,
  returnTo,
}: {
  itemId: string;
  returnTo?: string;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const navigation = useAppNavigation();
  const returnPath = inboxReturnPath(returnTo);
  const mutationPending = useRef(false);
  const resource = useAdminResource(() => getInboxItem(itemId), itemId, {
    policy: "ambient",
  });
  const [pending, setPending] = useState(false);
  const automaticallyMarkedReadId = useRef<string | null>(null);

  useEffect(() => {
    if (
      resource.data?.state !== "unread" ||
      resource.data?.trashedAt ||
      automaticallyMarkedReadId.current === itemId
    )
      return;

    automaticallyMarkedReadId.current = itemId;
    mutationPending.current = true;
    setPending(true);
    void updateInboxItem(itemId, "read")
      .then(resource.refresh)
      .catch(() => {
        toast.error("The Inbox item could not be marked read.");
      })
      .finally(() => {
        mutationPending.current = false;
        setPending(false);
      });
  }, [
    itemId,
    resource.data?.state,
    resource.data?.trashedAt,
    resource.refresh,
  ]);

  const back = {
    href: returnTo
      ? returnPath
      : resource.data?.trashedAt
        ? "/app/inbox?view=trash"
        : returnPath,
    label: "Back to Inbox",
  };
  if (resource.loading)
    return (
      <PageWorkspace navigationReady={false}>
        <PageHeader
          back={back}
          metadata={`ID: ${itemId}`}
          title="Inbox item"
        />
        <PageState title="Loading Inbox item" variant="loading" />
      </PageWorkspace>
    );
  if (resource.error || !resource.data)
    return (
      <PageWorkspace>
        <PageHeader back={back} title="Inbox item" />
        <PageState title="Inbox item could not be loaded" variant="error" />
      </PageWorkspace>
    );
  const item = resource.data;
  const archived = item.state === "archived";
  async function action(value: InboxAction) {
    if (mutationPending.current) return;
    mutationPending.current = true;
    automaticallyMarkedReadId.current = itemId;
    setPending(true);
    try {
      await updateInboxItem(itemId, value);
      if(value === "delete") {setDeleteOpen(false);notifyInboxChanged();toast.success("Inbox item permanently deleted");navigation.go(back.href);return;}
      if (value === "trash") showTrashUndo(itemId);
      else toast.success(inboxActionMessages[value]);
      notifyInboxChanged();
      if (value === "trash" || value === "archive" || value === "restore") {
        navigation.go(
          returnTo
            ? returnPath
            : value === "restore"
              ? "/app/inbox?view=trash"
              : returnPath,
        );
      } else resource.refresh();
    } catch {
      if(value === "delete") setDeleteError("The Inbox item could not be deleted. It may no longer be in Trash.");
      else toast.error("The Inbox item could not be updated.");
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  }
  return (
    <PageWorkspace>
      <ConfirmDialog opened={deleteOpen} title="Delete Inbox item?" confirmLabel="Delete permanently" pendingLabel="Deleting…" pending={pending} error={deleteError} onCancel={() => setDeleteOpen(false)} onConfirm={() => void action("delete")}>This permanently deletes this Inbox item. Linked Submissions and Pipeline Runs are kept. This action cannot be undone.</ConfirmDialog>
      <PageHeader
        back={back}
        documentTitle={item.sourceName + " · Inbox item"}
        actions={
          <Group gap={8} wrap="nowrap" data-testid="inbox-action-toolbar">
            {item.trashedAt ? (
              <Button
                disabled={pending}
                onClick={() => void action("restore")}
                type="button"
                variant="default"
                leftSection={<RotateCcw size={16} />}
              >
                {" "}
                Restore
              </Button>
            ) : (
              <>
                <Tooltip
                  label={archived ? "Move to Inbox" : "Archive"}
                  events={{ hover: true, focus: true, touch: false }}
                >
                  <Button
                    aria-label={archived ? "Move to Inbox" : "Archive"}
                    h={44}
                    w={{ base: 44, sm: "auto" }}
                    px={{ base: 0, sm: "sm" }}
                    disabled={pending}
                    onClick={() =>
                      void action(archived ? "unarchive" : "archive")
                    }
                    type="button"
                    variant="default"
                  >
                    <Group gap="xs" wrap="nowrap">
                      {archived ? (
                        <ArchiveRestore size={18} aria-hidden="true" />
                      ) : (
                        <Archive size={18} aria-hidden="true" />
                      )}
                      <Text component="span" inherit visibleFrom="sm">
                        {archived ? "Move to Inbox" : "Archive"}
                      </Text>
                    </Group>
                  </Button>
                </Tooltip>
                <Tooltip
                  label="Move to Trash"
                  events={{ hover: true, focus: true, touch: false }}
                >
                  <Button
                    aria-label="Move to Trash"
                    h={44}
                    w={{ base: 44, sm: "auto" }}
                    px={{ base: 0, sm: "sm" }}
                    disabled={pending}
                    onClick={() => void action("trash")}
                    type="button"
                    variant="default"
                  >
                    <Group gap="xs" wrap="nowrap">
                      <Trash2 size={18} aria-hidden="true" />
                      <Text component="span" inherit visibleFrom="sm">
                        Move to Trash
                      </Text>
                    </Group>
                  </Button>
                </Tooltip>
              </>
            )}
            <RowActionsMenu
              detail
              label="Inbox item actions"
              disabled={pending}
            >
              <RowNavigationItems
                items={[
                  item.submissionId
                    ? {
                        label: "Open Submission",
                        href:
                          "/app/submissions/" +
                          encodeURIComponent(item.submissionId) +
                          "?returnTo=" +
                          encodeURIComponent(returnPath),
                      }
                    : false,
                  item.sourcePublicId
                    ? {
                        label: "Open Source",
                        href:
                          "/app/sources/" +
                          encodeURIComponent(item.sourcePublicId),
                      }
                    : false,
                ]}
              />
              <Menu.Divider />
              {item.trashedAt ? (
                <>
                <Menu.Item onClick={() => void action("restore")}>Restore</Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={() => {setDeleteError("");setDeleteOpen(true);}}>Delete permanently</Menu.Item>
                </>
              ) : (
                <>
                  {item.state !== "archived" ? (
                    <Menu.Item
                      onClick={() =>
                        void action(item.state === "unread" ? "read" : "unread")
                      }
                    >
                      {item.state === "unread"
                        ? "Mark as read"
                        : "Mark as unread"}
                    </Menu.Item>
                  ) : null}
                  <Menu.Item
                    onClick={() =>
                      void action(
                        item.state === "archived" ? "unarchive" : "archive",
                      )
                    }
                  >
                    {item.state === "archived" ? "Move to Inbox" : "Archive"}
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" onClick={() => void action("trash")}>
                    Move to Trash
                  </Menu.Item>
                </>
              )}
            </RowActionsMenu>
          </Group>
        }
        description={<Group gap={6} wrap="wrap" style={{ overflowWrap: "anywhere" }}>
          <span>{item.sourceName}</span>
          <span aria-hidden="true">·</span>
          <span>Received <LocalDateTime value={item.createdAt} /></span>
          <span aria-hidden="true">·</span>
          <span>ID: {item.id}</span>
        </Group>}
        title="Inbox item"
      />
      <AdminResourceNotice resource={resource} />
      {item.tags.length > 0 ? <Group gap={4}>{item.tags.map(tag => <TagBadge key={tag.id} tag={tag} />)}</Group> : null}
      <InboxItemValues outputJson={item.payloadJson} />
    </PageWorkspace>
  );
}
