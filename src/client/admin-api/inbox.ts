import { localDateParameters } from "@/client/local-date-filters";
import type { AdminTag } from "@/shared/contracts/admin";
import { adminRequest } from "./client";

export type InboxItem = { submissionId?: string | null; actionName: string; createdAt: string; id: string; preview: string; sourceId: string | null; sourceName: string; sourcePublicId: string | null; state: "unread" | "read" | "archived"; tags: AdminTag[]; trashedAt: string | null };
export type InboxResponse = { items: InboxItem[]; total: number; hasTrash: boolean };
export function listInbox(query = "") { return adminRequest<InboxResponse>(`/api/admin/v1/inbox?${localDateParameters(new URLSearchParams(query))}`); }
export function getInboxItem(id: string) { return adminRequest<InboxItem & { payloadJson: string; submissionId: string | null }>(`/api/admin/v1/inbox/${encodeURIComponent(id)}`); }
export type InboxAction = "delete" | "trash" | "restore" | "read" | "unread" | "archive" | "unarchive";
export function updateInboxItem(id: string, action: InboxAction) { return adminRequest<void>(`/api/admin/v1/inbox/${encodeURIComponent(id)}`, { body: JSON.stringify({ action }), method: "PATCH" }); }
export function bulkUpdateInbox(ids: string[], action: InboxAction | "empty-trash") { return adminRequest<{ changed: number }>("/api/admin/v1/inbox", { body: JSON.stringify({ action, ids }), method: "POST" }); }

export function selectAllInbox(query: string) {
  const parameters = localDateParameters(new URLSearchParams(query));
  parameters.set("selection", "all");
  return adminRequest<{ids: string[]}>(`/api/admin/v1/inbox?${parameters}`);
}
