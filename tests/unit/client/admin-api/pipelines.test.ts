import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { adminRequest } = vi.hoisted(() => ({ adminRequest: vi.fn() }));
vi.mock("@/client/admin-api/client", () => ({ adminRequest }));

import {
  createPipeline,
  getPipelineRun,
  getPipelineRunForSubmission,
  getPipelineRunById,
  listGlobalPipelineRuns,
  listPipelineRuns,
  listWaitingCallbacks,
  retryPipelineAction,
} from "@/client/admin-api/pipelines";

describe("configured Pipelines administration client", () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    adminRequest.mockReset();
    process.env.TZ = "Europe/Prague";
  });
  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  test("creates a Pipeline through its standalone resource", async () => {
    adminRequest.mockResolvedValue({ id: "flow-1" });

    await createPipeline({
      name: "Notify CRM",
      sourceId: "source-1",
      steps: [{ name: "Send webhook", type: "webhook" }],
    });

    expect(adminRequest).toHaveBeenCalledWith(
      "/api/admin/v1/pipelines",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("loads a Run detail and retries one failed Action through dedicated routes", async () => {
    adminRequest
      .mockResolvedValueOnce({ actions: [], id: "run-1" })
      .mockResolvedValueOnce({ actions: [], id: "run-1" })
      .mockResolvedValueOnce({ actions: [], id: "run-1" })
      .mockResolvedValueOnce({ actionRunId: "action-2" });

    await getPipelineRun("flow-1", "run-1");
    await getPipelineRunById("run-1");
    await getPipelineRunForSubmission("submission-1", "run-1");
    await retryPipelineAction("action-2");

    expect(adminRequest).toHaveBeenNthCalledWith(
      1,
      "/api/admin/v1/pipelines/flow-1/runs/run-1",
    );
    expect(adminRequest).toHaveBeenNthCalledWith(
      2,
      "/api/admin/v1/pipeline-runs/run-1",
    );
    expect(adminRequest).toHaveBeenNthCalledWith(
      3,
      "/api/admin/v1/submissions/submission-1/pipeline-runs/run-1",
    );
    expect(adminRequest).toHaveBeenNthCalledWith(
      4,
      "/api/admin/v1/pipelines/runs/action-2/retry",
      { method: "POST" },
    );
  });

  test("preserves every Pipeline Run filter in the global list URL", async () => {
    adminRequest.mockResolvedValue({ items: [] });

    await listGlobalPipelineRuns({
      actionStatus: "failed_24h",
      from: "2026-09-01",
      pipelineId: "pipeline-1",
      sourceId: "source-1",
      status: "processing",
      tagIds: ["tag-a", "tag-b"],
      to: "2026-09-03",
    });

    expect(adminRequest).toHaveBeenCalledWith(
      "/api/admin/v1/pipeline-runs?actionStatus=failed_24h&sourceId=source-1&pipelineId=pipeline-1&status=processing&from=2026-08-31T22%3A00%3A00.000Z&to=2026-09-03T22%3A00%3A00.000Z&tagId=tag-a&tagId=tag-b",
    );
  });

  test("preserves callback queue filters and pagination in its URL", async () => {
    adminRequest.mockResolvedValue({ items: [], total: 0 });

    await listWaitingCallbacks({
      olderThanMinutes: 60,
      from: "2026-09-01",
      page: 2,
      pipelineId: "pipeline-1",
      size: 50,
      sourceId: "source-1",
      tagIds: ["tag-a", "tag-b"],
      to: "2026-09-03",
    });

    expect(adminRequest).toHaveBeenCalledWith(
      "/api/admin/v1/callbacks?olderThanMinutes=60&sourceId=source-1&pipelineId=pipeline-1&from=2026-08-31T22%3A00%3A00.000Z&to=2026-09-03T22%3A00%3A00.000Z&page=2&size=50&tagId=tag-a&tagId=tag-b",
    );
  });
  test("preserves server page metadata and requests global and per-Pipeline pagination", async () => {
    const page = { items: [], page: 2, pageSize: 10, total: 31 };
    adminRequest.mockResolvedValue(page);
    await expect(
      listGlobalPipelineRuns({ page: 2, size: 10 }),
    ).resolves.toEqual(page);
    expect(adminRequest).toHaveBeenLastCalledWith(
      "/api/admin/v1/pipeline-runs?page=2",
    );
    await expect(
      listPipelineRuns("flow-1", { page: 2, size: 10 }),
    ).resolves.toEqual(page);
    expect(adminRequest).toHaveBeenLastCalledWith(
      "/api/admin/v1/pipelines/flow-1/runs?page=2",
    );
  });
});
