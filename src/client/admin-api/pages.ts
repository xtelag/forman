import type { AdminPageDetail, AdminPageSummary, AdminPagesResponse } from "@/shared/contracts/admin";

export type { AdminPageDetail, AdminPageSummary } from "@/shared/contracts/admin";

import { adminRequest } from "./client";

export async function listPages(): Promise<AdminPageSummary[]> {
  return (await adminRequest<AdminPagesResponse>("/api/admin/v1/pages")).items;
}

export function getPage(pageId: string) {
  return adminRequest<AdminPageDetail>(`/api/admin/v1/pages/${encodeURIComponent(pageId)}`);
}

export function createPage(input: { sourceId: string; name: string }) {
  return adminRequest<AdminPageDetail>("/api/admin/v1/pages", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function updatePage(pageId: string, input: Pick<AdminPageDetail, "enabled" | "name" | "presentation">) {
  return adminRequest<AdminPageDetail>(`/api/admin/v1/pages/${encodeURIComponent(pageId)}`, {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export function deletePage(pageId: string) {
  return adminRequest<void>(`/api/admin/v1/pages/${encodeURIComponent(pageId)}`, { method: "DELETE" });
}

export function setPagePublished(pageId: string, enabled: boolean) {
 return adminRequest<AdminPageDetail>(`/api/admin/v1/pages/${encodeURIComponent(pageId)}`, {body: JSON.stringify({enabled}), method: "PATCH"});
}
