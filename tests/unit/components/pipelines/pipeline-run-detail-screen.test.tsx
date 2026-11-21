import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AdminPipelineRunDetail } from "@/client/admin-api/pipelines";
import { PipelineRunDetailScreen } from "@/components/pipelines/pipeline-run-detail-screen";

vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("PipelineRunDetailScreen", () => {
  afterEach(cleanup);

  test("shows an Action timeline with payloads and retries only the failed Action", async () => {
    const user = userEvent.setup();
    const retryAction = vi.fn().mockResolvedValue({ actionRunId: "action-2" });
    const run: AdminPipelineRunDetail = {
      actions: [
        {
          attemptCount: 1,
          callbackExpiresAt: null,
          errorSummary: null,
          id: "action-1",
          inputPayload: { email: "ada@example.test" },
          maximumAttempts: 3,
          name: "Enrich",
          nextAttemptAt: null,
          outputPayload: { email: "ada@example.test", verified: true },
          position: 1,
          status: "completed",
          type: "webhook",
          updatedAt: "2026-09-02T10:01:00.000Z",
        },
        {
          attemptCount: 3,
          callbackExpiresAt: null,
          errorSummary: "Connection refused",
          id: "action-2",
          inputPayload: { email: "ada@example.test", verified: true },
          maximumAttempts: 3,
          name: "Notify sales",
          nextAttemptAt: null,
          outputPayload: null,
          position: 2,
          status: "failed",
          type: "email",
          updatedAt: "2026-09-02T10:02:00.000Z",
        },
      ],
      createdAt: "2026-09-02T10:00:00.000Z",
      pipelineName: "Verify contact",
      pipelineId: "pipeline-1",
      submissionId: "submission-1",
      id: "run-1",
      status: "completed_attention",
      updatedAt: "2026-09-02T10:02:00.000Z",
    };
    render(
      <PipelineRunDetailScreen
        context={{ kind: "submission", submissionId: "submission-1" }}
        loadRun={async () => run}
        retryAction={retryAction}
        runId="run-1"
      />,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Verify contact" }),
    ).toBeVisible();
    expect(screen.getByText("ID: run-1")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Pipeline Run actions"}));
    expect(screen.getByRole("menuitem", {name: "Open Pipeline"})).toHaveAttribute("href", "/app/pipelines/pipeline-1");
    expect(screen.getByRole("menuitem", {name: "Open Submission"})).toHaveAttribute("href", "/app/submissions/submission-1");
    await user.keyboard("{Escape}");
    expect(screen.getByText("Completed with attention")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Run status" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Submission" }),
    ).toHaveAttribute("href", "/app/submissions/submission-1");
    expect(screen.getByRole("button", { name: /1\. Enrich/ })).toBeVisible();
    expect(screen.queryByText("Connection refused")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /1\. Enrich/ }));
    expect(screen.getAllByText(/"verified": true/)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /2\. Notify sales/ }));
    await waitFor(() =>
      expect(screen.getByText("Connection refused")).toBeVisible(),
    );

    await user.click(
      await screen.findByRole("button", { name: "Retry Action" }),
    );

    await waitFor(() => expect(retryAction).toHaveBeenCalledWith("action-2"));
  });

  test("describes completed Actions by their completed attempt and hides stale retry timing", async () => {
    const run: AdminPipelineRunDetail = {
      actions: [
        {
          attemptCount: 1,
          callbackExpiresAt: null,
          errorSummary: null,
          id: "action-1",
          inputPayload: {},
          maximumAttempts: 3,
          name: "Archive",
          nextAttemptAt: "2026-09-02T10:03:00.000Z",
          outputPayload: {},
          position: 1,
          status: "completed",
          type: "inbox",
          updatedAt: "2026-09-02T10:01:00.000Z",
        },
        {
          attemptCount: 0,
          callbackExpiresAt: null,
          errorSummary: null,
          id: "action-2",
          inputPayload: {},
          maximumAttempts: 3,
          name: "Store output",
          nextAttemptAt: null,
          outputPayload: {},
          position: 2,
          status: "completed",
          type: "inbox",
          updatedAt: "2026-09-02T10:01:00.000Z",
        },
      ],
      createdAt: "2026-09-02T10:00:00.000Z",
      id: "run-1",
      pipelineName: "Archive leads",
      status: "completed",
      updatedAt: "2026-09-02T10:01:00.000Z",
    };
    const user = userEvent.setup();
    render(
      <PipelineRunDetailScreen
        context={{ kind: "global" }}
        loadRun={async () => run}
        runId="run-1"
      />,
    );

    const action = await screen.findByRole("button", { name: /1\. Archive/ });
    expect(action).toHaveTextContent(/Type: Inbox\s*· Attempt 1/);
    expect(
      screen.getByRole("button", { name: /2\. Store output/ }),
    ).toHaveTextContent("Inbox");
    expect(
      screen.getByRole("button", { name: /2\. Store output/ }),
    ).not.toHaveTextContent("attempt 0");
    await user.click(action);
    expect(screen.queryByText("Next retry")).not.toBeInTheDocument();
  });
});

const failedRun: AdminPipelineRunDetail = {
  id: "run-failed",
  pipelineName: "Failed pipeline",
  status: "completed_attention",
  createdAt: "2026-09-22T10:00:00Z",
  updatedAt: "2026-09-22T10:01:00Z",
  actions: [
    {
      id: "failed-action",
      name: "Deliver",
      position: 1,
      type: "email",
      status: "failed",
      inputPayload: { message: "hello" },
      outputPayload: null,
      attemptCount: 3,
      maximumAttempts: 3,
      updatedAt: "2026-09-22T10:01:00Z",
      callbackExpiresAt: null,
      nextAttemptAt: null,
      errorSummary: null,
    },
  ],
};
test("opens the exact callback from its fragment and shows confirmation expiry", async () => {
  window.location.hash = "waiting-confirmation";
  try {
    const run: AdminPipelineRunDetail = {
      ...failedRun,
      status: "processing",
      actions: [
        {
          ...failedRun.actions[0],
          id: "waiting-confirmation",
          name: "Confirm email",
          type: "email_confirmation",
          status: "waiting_callback",
          callbackExpiresAt: "2026-09-23T10:00:00Z",
        },
      ],
    };
    render(
      <PipelineRunDetailScreen
        context={{ kind: "global" }}
        loadRun={async () => run}
        runId={run.id}
      />,
    );
    const button = await screen.findByRole("button", {
      name: /1\. Confirm email/,
    });
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-expanded", "true"),
    );
    expect(await screen.findByText("Confirmation expires")).toBeVisible();
    expect(button).toHaveTextContent("Waiting for confirmation");
  } finally {
    window.location.hash = "";
  }
});
test("locks retries and reveals a late error inside its action", async () => {
  let reject!: (error: Error) => void;
  const retryAction = vi.fn(
    () =>
      new Promise((_resolve, rejectRequest) => {
        reject = rejectRequest;
      }),
  );
  const user = userEvent.setup();
  render(
    <PipelineRunDetailScreen
      context={{ kind: "global" }}
      loadRun={async () => failedRun}
      retryAction={retryAction}
      runId={failedRun.id}
    />,
  );
  const action = await screen.findByRole("button", { name: /1\. Deliver/ });
  await user.click(action);
  await user.click(await screen.findByRole("button", { name: "Retry Action" }));
  expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
  await user.click(action);
  await act(async () => reject(new Error("offline")));
  await waitFor(() => expect(action).toHaveAttribute("aria-expanded", "true"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be retried",
  );
  expect(
    within(screen.getByRole("region", { name: /1\. Deliver/ })).getByRole(
      "button",
      { name: "Retry Action" },
    ),
  ).toBeEnabled();
  expect(retryAction).toHaveBeenCalledTimes(1);
});
test("ignores retry failures after navigating to another run", async () => {
  let reject!: (error: Error) => void;
  const retryAction = vi.fn(
    () =>
      new Promise((_resolve, rejectRequest) => {
        reject = rejectRequest;
      }),
  );
  const user = userEvent.setup();
  const loadRun = vi.fn(async (id: string) => ({
    ...failedRun,
    id,
    pipelineName: id,
  }));
  const { rerender } = render(
    <PipelineRunDetailScreen
      context={{ kind: "global" }}
      loadRun={loadRun}
      retryAction={retryAction}
      runId="first"
    />,
  );
  await user.click(await screen.findByRole("button", { name: /1\. Deliver/ }));
  await user.click(await screen.findByRole("button", { name: "Retry Action" }));
  rerender(
    <PipelineRunDetailScreen
      context={{ kind: "global" }}
      loadRun={loadRun}
      retryAction={retryAction}
      runId="second"
    />,
  );
  await screen.findByText("second");
  await act(async () => reject(new Error("late")));
  expect(screen.queryByText(/could not be retried/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1\. Deliver/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
