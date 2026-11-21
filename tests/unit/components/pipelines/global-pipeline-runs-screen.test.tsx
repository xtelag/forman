import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { GlobalPipelineRunsScreen } from "@/components/pipelines/global-pipeline-runs-screen";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => <a href={href} {...properties}>{children}</a>,
  useAppNavigation: () => ({ go }),
}));

describe("GlobalPipelineRunsScreen", () => {
  afterEach(cleanup);

  test("presents Pipeline and Source context for an operational Run", async () => {
    render(<GlobalPipelineRunsScreen initialQuery={{page:"2",size:"10",tagId:["vip","sales"]}} loadPipelines={async () => []} loadSources={async () => [{ createdAt: "2026-09-01T00:00:00.000Z", enabled: true, fieldDefinitionMode: null, fieldDefinitionSource: null, id: "source", lastSubmission: null, name: "Contact", type: "one-shot" as const, pipelineCount: 1, pageCount: 0, sourceId: "public-source", submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0, tags: [{ id: "vip", name: "VIP", color: "blue" }], updatedAt: "2026-09-01T00:00:00.000Z" }]} loadTags={async () => []} loadRuns={async () => ({ page: 1, pageSize: 10, total: 1, items: [{
      actionCount: 2,
      completedActionCount: 1,
      createdAt: "2026-09-03T10:00:00.000Z",
      failedActionCount: 1,
      id: "run",
      pipelineId: "pipeline",
      pipelineName: "Notify CRM",
      processingActionCount: 0,
      skippedConditionCount: 0,
      sourceId: "source", sourcePublicId: "public-source",
      sourceName: "Contact",
      status: "completed_attention" as const,
      submissionId: "submission",
      updatedAt: "2026-09-03T10:01:00.000Z",
    }] })} />);

    expect(await screen.findByRole("heading", { name: "Pipeline Runs" })).toBeVisible();
    expect(screen.queryAllByRole("link", {name:"Notify CRM"})).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button",{name:"Actions for Run run"})[0]);
    expect(screen.getByRole("menuitem", {name:"Open Submission"})).toHaveAttribute("href","/app/submissions/submission?returnTo="+encodeURIComponent("/app/pipeline-runs?page=2&size=10&tagId=vip&tagId=sales"));
    expect(screen.getByRole("menuitem", {name:"Open Pipeline"})).toHaveAttribute("href", "/app/pipelines/pipeline");
    expect(screen.getByRole("menuitem", {name:"Open Source"})).toHaveAttribute("href", "/app/sources/public-source");
    expect(screen.getAllByText("1 / 2")[0]).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Tags" })).toBeInTheDocument();
    expect(screen.getAllByText("VIP")).toHaveLength(1);
  });

  test("offers Source, Pipeline, status, date and tag filters", async () => {
    render(<GlobalPipelineRunsScreen
      initialQuery={{ sourceId: "source" }}
      loadPipelines={async () => [{ enabled: true, id: "pipeline", name: "Notify CRM", sourceId: "source", sourcePublicId: "public-source", sourceName: "Contact", steps: [], tags: [] }]}
      loadRuns={async () => ({ items: [], page: 1, pageSize: 10, total: 0 })}
      loadSources={async () => [{ createdAt: "2026-09-01T00:00:00.000Z", enabled: true, fieldDefinitionMode: null, fieldDefinitionSource: null, id: "source", lastSubmission: null, name: "Contact", type: "one-shot" as const, pipelineCount: 1, pageCount: 0, sourceId: "contact", submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0, tags: [], updatedAt: "2026-09-01T00:00:00.000Z" }]}
      loadTags={async () => [{ color: "blue", id: "tag", name: "VIP" }]}
    />);

    fireEvent.click(await screen.findByRole("button", {name: /^Filters/}));
    expect(await screen.findByLabelText("Source")).toHaveValue("source");
    expect(screen.getByLabelText("Pipeline")).toBeVisible();
    expect(screen.getByLabelText("Status")).toBeVisible();
    expect(screen.getByLabelText("From")).toBeVisible();
    expect(screen.getByLabelText("To")).toBeVisible();
    expect(screen.getByRole("group", { name: "Filter by tags" })).toBeVisible();
  });
  test("uses server totals and keeps filters in pagination while resetting page on apply", async () => {
    const loadRuns = vi.fn(async () => ({ items: [{ actionCount: 0, completedActionCount: 0, createdAt: "2026-09-03T10:00:00.000Z", failedActionCount: 0, id: "run", pipelineId: null, pipelineName: "Archive", processingActionCount: 0, skippedConditionCount: 0, sourceId: "source", sourcePublicId: "public-source", sourceName: "Contact", status: "completed" as const, submissionId: "submission", updatedAt: "2026-09-03T10:00:00.000Z" }], page: 2, pageSize: 10 as const, total: 31 }));
    render(<GlobalPipelineRunsScreen initialQuery={{ page: "2", size: "10", status: "completed" }} loadRuns={loadRuns} loadPipelines={async () => []} loadSources={async () => []} loadTags={async () => []} />);
    expect((await screen.findAllByText("11–11 of 31"))[0]).toBeVisible();
    expect(loadRuns).toHaveBeenCalledWith(expect.objectContaining({ page: 2, size: 10, status: "completed" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Next page" })[0]);
    expect(go).toHaveBeenLastCalledWith("/app/pipeline-runs?status=completed&page=3");
    fireEvent.click(screen.getByRole("button", {name: /^Filters/}));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(go).toHaveBeenLastCalledWith("/app/pipeline-runs?status=completed");
  });

  test("preserves the last-24-hour failure filter when applied and clears it when reset", async () => {
    const loaders = { loadRuns: async () => ({ items: [], page: 1, pageSize: 10 as const, total: 0 }), loadPipelines: async () => [], loadSources: async () => [], loadTags: async () => [] };
    const view = render(<GlobalPipelineRunsScreen {...loaders} initialQuery={{ actionStatus: "failed_24h" }} />);
    fireEvent.click(await screen.findByRole("button", {name: /^Filters/}));
    expect(await screen.findByLabelText("Status")).toHaveValue("failed_actions_24h");
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(go).toHaveBeenLastCalledWith("/app/pipeline-runs?actionStatus=failed_24h");
    fireEvent.click(screen.getByRole("button", {name: /^Filters/}));
    fireEvent.click(screen.getByRole("button", {name: "Reset filters"}));
    expect(go).toHaveBeenLastCalledWith("/app/pipeline-runs");
    view.rerender(<GlobalPipelineRunsScreen {...loaders} initialQuery={{}} />);
    fireEvent.click(await screen.findByRole("button", {name: /^Filters/}));
    expect(await screen.findByLabelText("Status")).toHaveValue("all");
  });

  test("rejects a reversed date range and clears the error when corrected", async () => {
    render(<GlobalPipelineRunsScreen loadRuns={async () => ({items: [], page: 1, pageSize: 10, total: 0})} loadPipelines={async () => []} loadSources={async () => []} loadTags={async () => []} />);
    await screen.findByLabelText("From");
    fireEvent.click(screen.getByRole("button", {name: /^Filters/}));
    go.mockClear();
    fireEvent.change(screen.getByLabelText("From"), {target: {value: "2026-09-29"}});
    fireEvent.change(screen.getByLabelText("To"), {target: {value: "2026-09-01"}});
    fireEvent.click(screen.getByRole("button", {name: "Apply filters"}));
    expect(screen.getByText("To must be on or after From.")).toBeVisible();
    expect(go).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("To"), {target: {value: "2026-09-30"}});
    expect(screen.queryByText("To must be on or after From.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Apply filters"}));
    expect(go).toHaveBeenCalled();
  });

});
