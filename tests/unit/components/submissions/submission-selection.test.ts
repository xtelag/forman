import { describe, expect, test } from "vitest";

import { clearSubmissionSelection, isSubmissionSelected, selectAllMatchingSubmissions, selectSubmission, selectedSubmissionCount, toSubmissionDeleteSelection } from "@/components/submissions/submission-selection";

describe("submission selection", () => {
  test("excludes an individual submission after selecting all matching results", () => {
    const all = selectAllMatchingSubmissions({}, 24, "2026-08-17T16:00:00.000Z");
    const withoutOne = selectSubmission(all, "submission-7", false);

    expect(selectedSubmissionCount(withoutOne)).toBe(23);
    expect(isSubmissionSelected(withoutOne, "submission-7")).toBe(false);
    expect(toSubmissionDeleteSelection(withoutOne)).toEqual({
      excludedIds: ["submission-7"],
      filter: {},
      snapshotBefore: "2026-08-17T16:00:00.000Z",
      type: "filter",
    });
  });

  test("keeps explicit IDs separate from a filter selection", () => {
    const selected = selectSubmission(selectSubmission(null, "submission-1", true), "submission-2", true);
    const deselected = selectSubmission(selected, "submission-1", false);

    expect(toSubmissionDeleteSelection(deselected)).toEqual({ ids: ["submission-2"], type: "ids" });
    expect(clearSubmissionSelection(deselected)).toBeNull();
    expect(selectedSubmissionCount(clearSubmissionSelection(deselected))).toBe(0);
  });

  test("removes an exclusion when the row is selected again", () => {
    const all = selectAllMatchingSubmissions({ search: "person@example.test" }, 2, "2026-08-17T16:00:00.000Z");
    const excluded = selectSubmission(all, "submission-1", false);
    const restored = selectSubmission(excluded, "submission-1", true);

    expect(selectedSubmissionCount(restored)).toBe(2);
    expect(isSubmissionSelected(restored, "submission-1")).toBe(true);
  });
});
