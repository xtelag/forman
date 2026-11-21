import type { AdminSourceDetail, AdminSourceDetailResponse, AdminTag } from "@/shared/contracts/admin";

import { adminRequest } from "./client";

export type AdminSourceSummary = Pick<AdminSourceDetail, "type" | "createdAt" | "enabled" | "fieldDefinitionMode" | "fieldDefinitionSource" | "sourceId" | "id" | "name" | "tags" | "updatedAt"> & {
  pipelineCount: number;
  pageCount: number;
  lastSubmission: { createdAt: string; id: string } | null;
  totalSubmissionCount: number;
  submissionsLast24Hours: number;
  submissionsLast7Days: number;
  submissionsLast30Days: number;
};

export type AdminCreatedSource = Pick<
  AdminSourceDetail,
  "type" | "allowedOrigins" | "altchaEnabled" | "challengeRateLimitPerMinute" | "enabled" | "sourceId" | "honeypotEnabled" | "honeypotFieldNames" | "id" | "name" | "retentionDays" | "storeReferer" | "storeUserAgent" | "submissionRateLimitPerMinute"
>;

export type AdminSourceConfiguration = Omit<Pick<
  AdminSourceDetail,
  "allowedOrigins" | "altchaEnabled" | "challengeRateLimitPerMinute" | "fieldDefinitionMode" | "fieldDefinitionSource" | "honeypotEnabled" | "honeypotFieldNames" | "maxBodyBytes" | "maxEntries" | "maxKeyLength" | "maxUniqueKeys" | "maxValueLength" | "maxValuesPerKey" | "name" | "retentionDays" | "storeReferer" | "storeUserAgent" | "submissionRateLimitPerMinute" | "successUrl"
>, "honeypotFieldNames"> & { honeypotFieldNames?: string[] };

type SourcesResponse = { items: AdminSourceSummary[] };

function sourcePath(sourceId: string) {
  return `/api/admin/v1/sources/${encodeURIComponent(sourceId)}`;
}

export async function listSources() {
  const response = await adminRequest<SourcesResponse>("/api/admin/v1/sources");
  return response.items;
}

export function getSource(sourceId: string) {
  return adminRequest<AdminSourceDetailResponse>(sourcePath(sourceId));
}

export function createSource(values: { name: string; type: AdminSourceDetail["type"] }) {
  return adminRequest<AdminCreatedSource>("/api/admin/v1/sources", {
    body: JSON.stringify(values),
    method: "POST",
  });
}

export function configureSource(sourceId: string, configuration: AdminSourceConfiguration) {
  return adminRequest<AdminSourceDetail>(sourcePath(sourceId), {
    body: JSON.stringify(configuration),
    method: "PUT",
  });
}

export type SourceSettingsSection = "configuration" | "advanced" | "source-fields" | "protection";
export type SourceSaveSection = SourceSettingsSection | "tags";

export function saveSourceSettingsSection(
  sourceId: string,
  section: SourceSaveSection,
  values: Record<string, unknown>,
) {
  return adminRequest<AdminSourceDetail>(sourcePath(sourceId), {
    body: JSON.stringify({ section, values }),
    method: "PATCH",
  });
}

export function setSourceEnabled(sourceId: string, enabled: boolean) {
  return adminRequest<AdminSourceDetail>(sourcePath(sourceId), {
    body: JSON.stringify({ enabled }),
    method: "PATCH",
  });
}

export function deleteSource(sourceId: string) {
  return adminRequest<void>(sourcePath(sourceId), { method: "DELETE" });
}

export function getServerToken(sourceId: string) {
  return adminRequest<{ prefix: string; token: string }>(`${sourcePath(sourceId)}/server-token`);
}

export function regenerateServerToken(sourceId: string) {
  return adminRequest<{ prefix: string; token: string }>(`${sourcePath(sourceId)}/server-token`, { method: "POST" });
}

export function sendTestSubmission(sourceId: string, payload: Record<string, unknown>) {
  return adminRequest<{ submissionId: string; success: true }>(`${sourcePath(sourceId)}/test-submission`, {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function listTags() {
  return adminRequest<{ items: AdminTag[] }>("/api/admin/v1/tags").then((response) => response.items);
}

export function createTag(values: Pick<AdminTag, "color" | "name">) {
  return adminRequest<AdminTag>("/api/admin/v1/tags", {
    body: JSON.stringify(values),
    method: "POST",
  });
}

export function deleteTag(tagId: string) {
  return adminRequest<{ assignedSourceCount: number; deleted: boolean }>(`/api/admin/v1/tags/${encodeURIComponent(tagId)}`, {
    method: "DELETE",
  });
}

export function getTagUsage(tagId: string) {
  return adminRequest<{ assignedSourceCount: number; assignedSourceNames: string[] }>(`/api/admin/v1/tags/${encodeURIComponent(tagId)}`);
}
