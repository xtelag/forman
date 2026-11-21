"use client";

import { toast } from "sonner";
import { bulkUpdateInbox, updateInboxItem } from "@/client/admin-api/inbox";

export const inboxActionMessages = {
  delete: "Inbox items permanently deleted",
  trash: "Moved to Trash",
  restore: "Restored",
  read: "Marked read",
  unread: "Marked unread",
  archive: "Archived",
  unarchive: "Moved to Inbox",
};

export function notifyInboxChanged() {
  window.dispatchEvent(new Event("forman:inbox-updated"));
}

/** Trash is recoverable, so moving items there offers Undo instead of a confirmation. */
export function showTrashUndo(ids: string | string[]) {
  const trashed = Array.isArray(ids) ? ids : [ids];
  let pending = false;
  toast.success(
    trashed.length === 1
      ? inboxActionMessages.trash
      : `${trashed.length} items moved to Trash`,
    {
      action: {
        label: "Undo",
        onClick: async () => {
          if (pending) return;
          pending = true;
          try {
            if (trashed.length === 1)
              await updateInboxItem(trashed[0], "restore");
            else for (let offset = 0; offset < trashed.length; offset += 100)
              await bulkUpdateInbox(trashed.slice(offset, offset + 100), "restore");
            notifyInboxChanged();
            toast.success(inboxActionMessages.restore);
          } catch {
            toast.error(
              trashed.length === 1
                ? "The Inbox item could not be restored."
                : "The Inbox items could not be restored.",
            );
          } finally {
            pending = false;
          }
        },
      },
    },
  );
}

export function inboxReturnPath(value?: string) {
  if (!value) return "/app/inbox";
  try {
    const url = new URL(value, "https://forman.invalid");
    return url.origin === "https://forman.invalid" && url.pathname === "/app/inbox"
      ? `${url.pathname}${url.search}` : "/app/inbox";
  } catch {
    return "/app/inbox";
  }
}
