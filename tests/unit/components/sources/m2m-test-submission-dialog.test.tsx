import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { M2mTestSubmissionDialog } from "@/components/sources/m2m-test-submission-dialog";

const { sendTestSubmission } = vi.hoisted(() => ({
  sendTestSubmission: vi.fn(),
}));

vi.mock("@/client/admin-api/sources", () => ({ sendTestSubmission }));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
}));

describe("M2mTestSubmissionDialog", () => {
  afterEach(() => {
    cleanup();
    sendTestSubmission.mockReset();
  });

  test("makes the real submission explicit and links to its result", async () => {
    const user = userEvent.setup();
    sendTestSubmission.mockResolvedValueOnce({
      submissionId: "submission-1",
      success: true,
    });
    render(<M2mTestSubmissionDialog sourceId="contact-form" />);

    await user.click(
      screen.getByRole("button", { name: "Send test Submission" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "This creates a real Submission using the current machine-to-machine token.",
    );
    expect(
      (screen.getByLabelText("JSON payload") as HTMLTextAreaElement).value,
    ).toContain("john.forman@example.com");

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Send test Submission",
      }),
    );
    expect(sendTestSubmission).toHaveBeenCalledWith(
      "contact-form",
      expect.objectContaining({ email: "john.forman@example.com" }),
    );
    expect(
      await screen.findByRole("link", { name: "View Submission" }),
    ).toHaveAttribute("href", "/app/submissions/submission-1");
  });

  test("keeps the pending submission dialog open and prevents duplicate sends", async () => {
    const user = userEvent.setup();
    let finish!: (value: { submissionId: string }) => void;
    sendTestSubmission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<M2mTestSubmissionDialog sourceId="contact-form" />);
    await user.click(
      screen.getByRole("button", { name: "Send test Submission" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Send test Submission",
      }),
    );
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(sendTestSubmission).toHaveBeenCalledTimes(1);
    await act(async () => finish({ submissionId: "submission-2" }));
    expect(
      await screen.findByRole("link", { name: "View Submission" }),
    ).toHaveAttribute("href", "/app/submissions/submission-2");
  });
});
