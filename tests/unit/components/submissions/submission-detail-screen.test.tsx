import { fireEvent, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SubmissionDetailScreen } from "@/components/submissions/submission-detail-screen";
import type { AdminSubmissionDetail } from "@/shared/contracts/admin";

vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => <a href={href} {...properties}>{children}</a>,
  useAppNavigation: () => ({ go: vi.fn(), refresh: vi.fn() }),
}));

const submission: AdminSubmissionDetail = {
  createdAt: "2026-08-13T10:00:00.000Z", id: "submission-1",
  payload: { email: "person@example.test" }, referer: null,
  sourceId: "source-1", sourceName: "Contact", sourcePublicId: "contact-public",
  pipelineRuns: [],
  tags: [], userAgent: null,
};

afterEach(cleanup);

describe("SubmissionDetailScreen", () => {

  test("links accepted input to its Pipeline Runs without assigning Submission a processing state", async () => {
    render(<SubmissionDetailScreen deleteSubmission={async () => undefined} loadSubmission={async () => submission} submissionId="submission-1" />);

    expect(await screen.findByRole("heading", { name: "Data" })).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("person@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Request metadata" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pipeline Runs" })).toBeInTheDocument();
    expect(screen.getByText("No Pipeline Runs.")).toBeVisible();
  });

  test("separates Pipeline navigation from the Run detail", async () => {
    const withRun: AdminSubmissionDetail = {
      ...submission,
      pipelineRuns: [{
        actionCount: 1,
        completedActionCount: 1,
        createdAt: "2026-09-03T07:00:00.000Z",
        failedActionCount: 0,
        id: "run-1",
        pipelineId: "pipeline-1",
        pipelineName: "Archive contacts",
        processingActionCount: 0,
        skippedConditionCount: 0,
        status: "completed",
        updatedAt: "2026-09-03T07:00:01.000Z",
      }],
    };

    render(<SubmissionDetailScreen deleteSubmission={async () => undefined} loadSubmission={async () => withRun} submissionId="submission-1" />);

    fireEvent.click((await screen.findAllByRole("button", {name:"Actions for Run run-1"}))[0]);
    expect(screen.getByRole("menuitem", {name:"Open Pipeline"})).toHaveAttribute("href", "/app/pipelines/pipeline-1");
    expect(screen.queryByRole("link", { name: "View run" })).not.toBeInTheDocument();
  });

  test("keeps submission deletion in the secondary actions menu", async () => {
    const user = userEvent.setup();
    render(<SubmissionDetailScreen deleteSubmission={async () => undefined} loadSubmission={async () => submission} submissionId="submission-1" />);

    await screen.findByRole("heading", { name: "Submission" });
    expect(screen.queryByRole("button", { name: "Delete permanently" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submission actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete permanently" })).toBeVisible();
  });

  test("shows the payload as fields or raw JSON", async () => {
    const user = userEvent.setup();
    render(<SubmissionDetailScreen deleteSubmission={async () => undefined} loadSubmission={async () => submission} submissionId="submission-1" />);

    await screen.findByText("person@example.test");
    expect(screen.queryByRole("code")).not.toBeInTheDocument();
    await user.click(screen.getByText("JSON"));
    expect(screen.getByRole("code")).toHaveTextContent("person@example.test");
  });

  test("summarizes state, Source and received time in the header", async () => {
    render(<SubmissionDetailScreen deleteSubmission={async () => undefined} loadSubmission={async () => ({ ...submission, state: "draft", type: "session" })} submissionId="submission-1" />);

    const header = (await screen.findByRole("heading", { name: "Submission" })).closest("header")!;
    expect(header).toHaveTextContent("Draft");
    expect(header).not.toHaveTextContent("Session");
    expect(header).toHaveTextContent("Received");
    expect(header).toHaveTextContent("Contact");
    expect(header?.querySelector("[data-slot=page-header-eyebrow]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submission actions" }));
    expect(screen.getByRole("menuitem", { name: "Open Source" })).toHaveAttribute("href", "/app/sources/contact-public");
  });

  test("explains why an unfinished submission cannot be deleted", async () => {
    const user = userEvent.setup();
    render(<SubmissionDetailScreen deleteSubmission={async () => undefined} loadSubmission={async () => ({ ...submission, state: "draft" })} submissionId="submission-1" />);

    await user.click(await screen.findByRole("button", { name: "Submission actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete permanently" })).toBeDisabled();
    expect(screen.getByText("Only completed Submissions can be deleted.")).toBeVisible();
  });
});

test("returns to the originating Runs list and rejects external return URLs",async()=>{
 const view=render(<SubmissionDetailScreen submissionId="submission-1" loadSubmission={async()=>submission} returnTo="/app/pipeline-runs?page=2" />);
 await screen.findByRole("heading",{name:"Submission"});
 expect(screen.getByRole("link",{name:"Back to Pipeline Runs"})).toHaveAttribute("href","/app/pipeline-runs?page=2");
 view.rerender(<SubmissionDetailScreen submissionId="submission-1" loadSubmission={async()=>submission} returnTo="https://external.test/app/submissions" />);
 expect(screen.getByRole("link",{name:"Back to all Submissions"})).toHaveAttribute("href","/app/submissions");
});
test("keeps a historical Run accessible after its Pipeline was deleted",async()=>{
 render(<SubmissionDetailScreen submissionId="submission-1" loadSubmission={async()=>({...submission,pipelineRuns:[{id:"historical",pipelineId:null,pipelineName:"Old",createdAt:"2026-09-03T07:00:00Z",updatedAt:"2026-09-03T07:00:00Z",actionCount:0,completedActionCount:0,failedActionCount:0,processingActionCount:0,skippedConditionCount:0,status:"completed"}]})} />);
 await screen.findAllByText("Deleted pipeline");
 fireEvent.click(screen.getAllByRole("button",{name:"Actions for Run historical"})[0]);
 expect(screen.getByRole("menuitem",{name:"Open Pipeline Run"})).toHaveAttribute("href","/app/submissions/submission-1/pipeline-runs/historical");
 expect(screen.queryByRole("menuitem",{name:"Open Pipeline"})).not.toBeInTheDocument();
});

test("keeps request metadata collapsed and keyboard accessible", async () => {
  const user = userEvent.setup();
  render(<SubmissionDetailScreen submissionId="submission-1" loadSubmission={async () => ({ ...submission, userAgent: "QA browser" })} />);
  const details = await screen.findByRole("button", { name: "Technical details" });
  expect(details).toHaveAttribute("aria-expanded", "false");
  details.focus();
  await user.keyboard("{Enter}");
  expect(details).toHaveAttribute("aria-expanded", "true");
  await waitFor(() => expect(screen.getByText("QA browser")).toBeVisible());
});

test("shows session counters in Data without an empty technical disclosure", async () => {
  render(<SubmissionDetailScreen submissionId="submission-1" loadSubmission={async () => ({
    ...submission, userAgent: null, referer: null,
    meta: { sessionUpdateCount: 1, sessionRequestCount: 2 },
  })} />);
  expect(await screen.findByText("Session updates: 1")).toBeVisible();
  expect(screen.getByText("Session requests: 2")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Technical details" })).not.toBeInTheDocument();
});
