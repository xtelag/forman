import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PipelineRunsScreen } from "@/components/pipelines/pipeline-runs-screen";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("@/components/layout/app-link", () => ({
  useAppNavigation: () => ({ go }),
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => <a href={href} {...properties}>{children}</a>,
}));

describe("PipelineRunsScreen", () => {
  afterEach(cleanup);

  test("identifies the Pipeline context without assuming it can run", async () => {
    render(<PipelineRunsScreen pipelineId="flow-1" loadRuns={async () => ({ items: [], page: 1, pageSize: 10, total: 0 })} />);

    expect(await screen.findByRole("heading", { name: "No Pipeline Runs for this Pipeline" })).toBeVisible();
    expect(
      screen.queryByText("Send a Submission to this Pipeline's Source to start a Run."),
    ).not.toBeInTheDocument();
  });

  test("keeps the Pipeline return path and renders Run lifecycle as a state label", async () => {
    render(<PipelineRunsScreen pipelineId="flow-1" loadRuns={async () => ({ page: 1, pageSize: 10, total: 1, items: [{ createdAt: "2026-09-02T10:00:00.000Z", id: "run-1", status: "completed_attention", summary: "1 / 2" }] })} />);

    expect(await screen.findByRole("link", { name: "Back to Pipeline" })).toHaveAttribute("href", "/app/pipelines/flow-1");
    expect(screen.getAllByText("Completed with attention")[0]?.closest("[data-status]")).toHaveAttribute("data-status", "warning");
    expect(screen.getByRole("group", { name: "Top table controls" })).toBeVisible();
  });
  test("requests and navigates a server page within its Pipeline", async () => {
    const loadRuns = vi.fn(async () => ({ page: 2, pageSize: 10 as const, total: 31, items: [{ createdAt: "2026-09-02T10:00:00.000Z", id: "run-1", status: "completed" as const, summary: "1 / 1" }] }));
    render(<PipelineRunsScreen pipelineId="flow-1" initialQuery={{ page: "2", size: "10" }} loadRuns={loadRuns} />);
    expect((await screen.findAllByText("11–11 of 31"))[0]).toBeVisible();
    expect(loadRuns).toHaveBeenCalledWith("flow-1", { page: 2, size: 10, search: undefined });
    fireEvent.click(screen.getAllByRole("button", { name: "Next page" })[0]);
    expect(go).toHaveBeenLastCalledWith("/app/pipelines/flow-1/runs?page=3");
  });

});
