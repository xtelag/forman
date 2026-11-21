import { localDateParameters, localDateBoundary } from "@/client/local-date-filters";
import type { AdminSubmissionDetail, AdminSubmissionsResponse, SubmissionDeleteSelection } from "@/shared/contracts/admin";

import { adminRequest } from "./client";

export type SubmissionQuery = {
  snapshotBefore?: string;
  type?: string;
  state?: string;
  sourceId?: string;
  from?: string;
  limit?: number;
  offset?: number;
  search?: string;
  tagIds?: string[];
  to?: string;
};

export type { SubmissionFilter } from "@/shared/contracts/admin";

function submissionsPath(query: SubmissionQuery = {}) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "tagIds") {
      for (const tagId of (value as string[] | undefined) ?? []) parameters.append("tagId", tagId);
    } else if (value !== undefined) {
      parameters.set(key, String(value));
    }
  }
  const search = localDateParameters(parameters).toString();
  return search ? `/api/admin/v1/submissions?${search}` : "/api/admin/v1/submissions";
}

export function listSubmissions(query?: SubmissionQuery) {
  return adminRequest<AdminSubmissionsResponse>(submissionsPath(query));
}

export function getSubmission(submissionId: string) {
  return adminRequest<AdminSubmissionDetail>(`/api/admin/v1/submissions/${encodeURIComponent(submissionId)}`);
}

export function deleteSubmission(submissionId: string) {
  return adminRequest<void>(`/api/admin/v1/submissions/${encodeURIComponent(submissionId)}`, { method: "DELETE" });
}

export function deleteSubmissionSelection(selection: SubmissionDeleteSelection) {
  return adminRequest<{ deleted: number; hasMore?: boolean }>("/api/admin/v1/submissions", {
    body: JSON.stringify(selection.type === "filter" ? { ...selection, filter: { ...selection.filter, from: selection.filter.from ? localDateBoundary(selection.filter.from) : undefined, to: selection.filter.to ? localDateBoundary(selection.filter.to, true) : undefined } } : selection),
    method: "DELETE",
  });
}
