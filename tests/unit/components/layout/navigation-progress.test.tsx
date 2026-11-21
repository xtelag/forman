import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { navigation } = vi.hoisted(() => ({ navigation: { pathname: "/app/sources" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { NavigationProgress, NavigationProgressProvider } from "@/components/layout/navigation-progress";

describe("NavigationProgress", () => {
  beforeEach(() => {
    navigation.pathname = "/app/sources";
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("shows the delayed indicator for a navigation that takes longer than 150 ms", () => {
    render(<NavigationProgressProvider><NavigationProgress /></NavigationProgressProvider>);

    act(() => window.dispatchEvent(new Event("forman:navigation-start")));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  test("keeps the indicator visible until the next screen reports that it rendered", () => {
    const view = render(<NavigationProgressProvider><NavigationProgress /></NavigationProgressProvider>);
    act(() => window.dispatchEvent(new Event("forman:navigation-start")));
    act(() => vi.advanceTimersByTime(150));

    navigation.pathname = "/app/submissions";
    view.rerender(<NavigationProgressProvider><NavigationProgress /></NavigationProgressProvider>);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("forman:navigation-complete")));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
