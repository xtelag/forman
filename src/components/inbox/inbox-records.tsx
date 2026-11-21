"use client";
import type { ReactNode } from "react";
import type { TablePaginationProperties } from "@/components/patterns/table-pagination";

import { RowNavigationItems } from "@/components/patterns/row-navigation-items";

import { Text, VisuallyHidden, Menu } from "@mantine/core";
import type { InboxItem, InboxAction } from "@/client/admin-api/inbox";
import { LocalDateTime } from "@/components/patterns/local-date-time";
import { ResourceTable } from "@/components/patterns/resource-table";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { TagList } from "@/components/tags/tag-list";

type InboxRecordsProps = {
  pagination?: TablePaginationProperties;
  bulkActions?: ReactNode;
  items: InboxItem[];
  selected: string[];
  pending: boolean;
  trash: boolean;
  detailPath: (id: string) => string;
  onOpen: (id: string) => void;
  onAction?: (id: string, action: InboxAction) => void;
  onSelectionChange: (ids: string[]) => void;
};

export function InboxRecords({
  items,
  pagination,
  bulkActions,
  selected,
  pending,
  trash,
  detailPath,
  onOpen,
  onSelectionChange,
  onAction,
}: InboxRecordsProps) {
  const unread = (item: InboxItem) => !trash && item.state === "unread";
  return (
    <ResourceTable
      pagination={pagination}
      bulkActions={bulkActions}
      busy={pending}
      ariaLabel="Inbox"
      getRowKey={(item) => item.id}
      items={items}
      onRowClick={pending ? undefined : (item) => onOpen(item.id)}
      selection={{
        allSelected:
          items.length > 0 && items.every((item) => selected.includes(item.id))
            ? true
            : items.some((item) => selected.includes(item.id))
              ? "indeterminate"
              : false,
        isSelectable: () => !pending,
        isSelected: (item) => selected.includes(item.id),
        onSelectAll: (checked) =>
          onSelectionChange(
            checked
              ? [...new Set([...selected, ...items.map((item) => item.id)])]
              : selected.filter((id) => !items.some((item) => item.id === id)),
          ),
        onSelectedChange: (item, checked) =>
          onSelectionChange(
            checked
              ? [...new Set([...selected, item.id])]
              : selected.filter((id) => id !== item.id),
          ),
      }}
      columns={[
        {
          id: "preview",
          label: "Preview",
          render: (item) => (
            <Text
              size="sm"
              title={item.preview}
              c="inherit"
              fw={unread(item) ? 600 : 400}
              truncate
            >
              {unread(item) ? <VisuallyHidden>Unread: </VisuallyHidden> : null}
              {item.preview || "Empty response"}
            </Text>
          ),
        },
        {
          id: "source",
          label: "Source",
          render: (item) => (
            <Text size="sm" truncate title={item.sourceName}>
              {item.sourceName}
            </Text>
          ),
        },
        {
          id: "received",
          label: "Received",
          width: 176,
          sizing: "compact",
          render: (item) => (
            <Text size="sm" c="dimmed">
              <LocalDateTime value={item.createdAt} />
            </Text>
          ),
        },
        {
          id: "tags",
          label: "Tags",
          width: 160,
          render: (item) => <TagList tags={item.tags} />,
        },
        ...(onAction
          ? [
              {
                id: "actions",
                label: <VisuallyHidden>Actions</VisuallyHidden>,
                sizing: "action" as const,
                mobileAction: true,
                render: (item: InboxItem) => (
                  <RowActionsMenu
                    label={"Actions for " + (item.preview || "Empty response")}
                    disabled={pending}
                  >
                    <RowNavigationItems
                      items={[
                        { label: "Open Inbox item", href: detailPath(item.id) },
                        Boolean(item.submissionId) && {
                          label: "Open Submission",
                          href:
                            "/app/submissions/" +
                            encodeURIComponent(item.submissionId!) +
                            "?returnTo=" +
                            encodeURIComponent(
                              new URL(
                                detailPath(item.id),
                                "https://forman.invalid",
                              ).searchParams.get("returnTo") ?? "/app/inbox",
                            ),
                        },
                        Boolean(item.sourcePublicId) && {
                          label: "Open Source",
                          href:
                            "/app/sources/" +
                            encodeURIComponent(item.sourcePublicId!),
                        },
                      ]}
                    />

                    <Menu.Divider />
                    {trash ? (
                      <>
                        <Menu.Item onClick={() => onAction(item.id, "restore")}>
                          Restore
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          onClick={() => onAction(item.id, "delete")}
                        >
                          Delete permanently
                        </Menu.Item>
                      </>
                    ) : (
                      <>
                        {item.state !== "archived" ? (
                          <Menu.Item
                            onClick={() =>
                              onAction(
                                item.id,
                                item.state === "unread" ? "read" : "unread",
                              )
                            }
                          >
                            {item.state === "unread"
                              ? "Mark as read"
                              : "Mark as unread"}
                          </Menu.Item>
                        ) : null}
                        <Menu.Item
                          onClick={() =>
                            onAction(
                              item.id,
                              item.state === "archived"
                                ? "unarchive"
                                : "archive",
                            )
                          }
                        >
                          {item.state === "archived"
                            ? "Move to Inbox"
                            : "Archive"}
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          onClick={() => onAction(item.id, "trash")}
                        >
                          Move to Trash
                        </Menu.Item>
                      </>
                    )}
                  </RowActionsMenu>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
