import type { SubmissionDeleteSelection, SubmissionFilter } from "@/shared/contracts/admin";

export type SubmissionSelection =
  | null
  | { ids: Set<string>; type: "ids" }
  | {
      excludedIds: Set<string>;
      filter: SubmissionFilter;
      snapshotBefore: string;
      total: number;
      type: "filter";
    };

export function clearSubmissionSelection(selection?: SubmissionSelection) {
  void selection;
  return null;
}

export function selectAllMatchingSubmissions(filter: SubmissionFilter, total: number, snapshotBefore: string): SubmissionSelection {
  return { excludedIds: new Set(), filter, snapshotBefore, total, type: "filter" };
}

export function isSubmissionSelected(selection: SubmissionSelection, submissionId: string) {
  if (!selection) return false;
  return selection.type === "ids" ? selection.ids.has(submissionId) : !selection.excludedIds.has(submissionId);
}

export function selectSubmission(selection: SubmissionSelection, submissionId: string, selected: boolean): SubmissionSelection {
  if (!selection || selection.type === "ids") {
    const ids = new Set(selection?.type === "ids" ? selection.ids : []);
    if (selected) ids.add(submissionId);
    else ids.delete(submissionId);
    return ids.size === 0 ? null : { ids, type: "ids" };
  }

  const excludedIds = new Set(selection.excludedIds);
  if (selected) excludedIds.delete(submissionId);
  else excludedIds.add(submissionId);
  return { ...selection, excludedIds };
}

export function selectedSubmissionCount(selection: SubmissionSelection) {
  if (!selection) return 0;
  return selection.type === "ids" ? selection.ids.size : selection.total - selection.excludedIds.size;
}

export function toSubmissionDeleteSelection(selection: SubmissionSelection): SubmissionDeleteSelection | null {
  if (!selection) return null;
  if (selection.type === "ids") return { ids: [...selection.ids].sort(), type: "ids" };
  return {
    excludedIds: [...selection.excludedIds].sort(),
    filter: selection.filter,
    snapshotBefore: selection.snapshotBefore,
    type: "filter",
  };
}
