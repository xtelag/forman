import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PageState } from "@/components/patterns/page-state";
import { NavigationProgressProvider } from "@/components/layout/navigation-progress";

describe("PageState", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("shows loading work only after 150 milliseconds", () => {
    vi.useFakeTimers();
    render(<PageState title="Loading sources" variant="loading" />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(149));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));

    const loadingState = screen.getByRole("status");
    expect(loadingState).toHaveAttribute("aria-live", "polite");
    expect(loadingState).toHaveTextContent("Loading sources");
    expect(screen.getByTestId("page-state-loader")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("keeps its loading spinner visible while navigation is in progress", () => {
    vi.useFakeTimers();
    render(
      <NavigationProgressProvider>
        <PageState title="Loading sources" variant="loading" />
      </NavigationProgressProvider>,
    );

    act(() => window.dispatchEvent(new Event("forman:navigation-start")));
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByTestId("page-state-loader")).toBeInTheDocument();
  });

  test("presents an empty collection with a next action", () => {
    render(
      <PageState
        action={<button type="button">Create Source</button>}
        title="No sources yet"
        variant="empty"
      >
        Create the first collection endpoint.
      </PageState>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("No sources yet");
    expect(
      screen.getByRole("button", { name: "Create Source" }),
    ).toBeInTheDocument();
  });

  test("announces an error urgently and keeps its supplied retry action usable", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(
      <PageState
        action={
          <button onClick={retry} type="button">
            Try again
          </button>
        }
        title="Could not load sources"
        variant="error"
      >
        Check the connection and retry.
      </PageState>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load sources",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
