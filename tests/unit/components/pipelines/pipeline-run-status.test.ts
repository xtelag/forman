import { describe, expect, test } from "vitest";

import { hasActiveActionRuns, hasActivePipelineRuns, isActivePipelineRun } from "@/components/pipelines/pipeline-run-status";

describe("Pipeline Run status", () => {
  test("recognizes only non-terminal Pipeline Run states as active", () => {
    expect(isActivePipelineRun("pending")).toBe(true);
    expect(isActivePipelineRun("processing")).toBe(true);
    expect(isActivePipelineRun("completed")).toBe(false);
    expect(isActivePipelineRun("completed_attention")).toBe(false);
    expect(isActivePipelineRun("cancelled")).toBe(false);
  });

  test("recognizes active Pipeline Runs and Action Runs in a collection", () => {
    expect(hasActivePipelineRuns([{ status: "completed" }, { status: "processing" }])).toBe(true);
    expect(hasActivePipelineRuns([{ status: "completed" }])).toBe(false);
    expect(hasActiveActionRuns([{ status: "waiting_callback" }])).toBe(true);
    expect(hasActiveActionRuns([{ status: "retry_scheduled" }])).toBe(true);
    expect(hasActiveActionRuns([{ status: "completed" }])).toBe(false);
  });
});
