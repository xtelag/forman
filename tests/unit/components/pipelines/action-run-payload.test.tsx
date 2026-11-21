import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ActionRunPayload } from "@/components/pipelines/action-run-payload";

describe("ActionRunPayload", () => {
  afterEach(cleanup);
  test("renders one unchanged payload for a completed Webhook", () => {
    render(
      <ActionRunPayload
        action={{
          inputPayload: { email: "ada@example.test" },
          outputPayload: { email: "ada@example.test" },
          status: "completed",
          type: "webhook",
        }}
      />,
    );

    expect(screen.getByText("Payload unchanged")).toBeVisible();
    expect(screen.queryByText("Payload")).not.toBeInTheDocument();
    expect(screen.queryByText("Input payload")).not.toBeInTheDocument();
    expect(screen.queryByText("Output payload")).not.toBeInTheDocument();
  });

  test("uses an action-specific single payload for Inbox and E-mail", () => {
    const { rerender } = render(
      <ActionRunPayload
        action={{
          inputPayload: { email: "ada@example.test" },
          outputPayload: { archived: true },
          status: "completed",
          type: "inbox",
        }}
      />,
    );
    expect(screen.getByText("Stored payload")).toBeVisible();
    expect(screen.queryByText("Input payload")).not.toBeInTheDocument();

    rerender(
      <ActionRunPayload
        action={{
          inputPayload: { email: "ada@example.test" },
          outputPayload: null,
          status: "completed",
          type: "email",
        }}
      />,
    );
    expect(screen.getByText("Sent payload")).toBeVisible();
  });

  test("keeps only input payload before an Action produces output", () => {
    render(
      <ActionRunPayload
        action={{
          inputPayload: { email: "ada@example.test" },
          outputPayload: null,
          status: "waiting_callback",
          type: "callback",
        }}
      />,
    );

    expect(screen.getByText("Input payload")).toBeVisible();
    expect(screen.queryByText("Payload unchanged")).not.toBeInTheDocument();
  });
});

test("does not label failed delivery as sent or stored", () => {
  const { rerender, unmount } = render(
    <ActionRunPayload
      action={{
        inputPayload: { email: "ada@example.test" },
        outputPayload: null,
        status: "failed",
        type: "email",
      }}
    />,
  );
  expect(screen.getByText("Input payload")).toBeVisible();
  expect(screen.queryByText("Sent payload")).not.toBeInTheDocument();
  rerender(
    <ActionRunPayload
      action={{
        inputPayload: { email: "ada@example.test" },
        outputPayload: null,
        status: "failed",
        type: "inbox",
      }}
    />,
  );
  expect(screen.getByText("Input payload")).toBeVisible();
  expect(screen.queryByText("Stored payload")).not.toBeInTheDocument();
  unmount();
});

test("shows JSON directly without a view switch", () => {
  render(<ActionRunPayload action={{ inputPayload: { note: "Hello" }, outputPayload: null, status: "pending", type: "email" }} />);
  expect(screen.getByLabelText("Input payload JSON")).toHaveTextContent('"note": "Hello"');
  expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  cleanup();
});
