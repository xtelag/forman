import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mobileState } = vi.hoisted(() => ({
  mobileState: { isMobile: false },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/sources",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@teispace/next-themes", () => ({
  useHydrated: () => true,
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mobileState.isMobile,
}));

import { AppShell } from "@/components/layout/app-shell";

describe("AppShell", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mobileState.isMobile = false;
  });

  test("shows every destination in open groups and remembers a collapsed group", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const { unmount } = render(
      <AppShell runtimeMode="production" version="0.1.0">
        <p>Screen content</p>
      </AppShell>,
    );

    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    const navigation = within(
      document.querySelector('[data-sidebar="content"]')!,
    ).getAllByRole("link");
    expect(
      navigation.map((link) => ({
        active: link.getAttribute("aria-current") === "page",
        href: link.getAttribute("href"),
        name: link.textContent,
      })),
    ).toEqual([
      { active: false, href: "/app", name: "Dashboard" },
      { active: false, href: "/app/inbox", name: "Inbox" },
      { active: false, href: "/app/submissions", name: "Submissions" },
      { active: false, href: "/app/pipeline-runs", name: "Pipeline Runs" },
      { active: false, href: "/app/callbacks", name: "Waiting Callbacks" },
      { active: true, href: "/app/sources", name: "Data Sources" },
      { active: false, href: "/app/pages", name: "Built-in Forms" },
      { active: false, href: "/app/pipelines", name: "Pipelines" },
      { active: false, href: "/app/settings", name: "Settings" },
    ]);
    const dataReviewButton = screen.getByRole("button", {
      name: "Data Review",
    });
    expect(dataReviewButton).toHaveAttribute("aria-expanded", "true");
    expect(dataReviewButton.querySelector("svg")).toHaveClass(
      "lucide-text-search",
    );
    const configurationButton = screen.getByRole("button", {
      name: "Configuration",
    });
    expect(configurationButton).toHaveAttribute("aria-expanded", "true");

    await user.click(configurationButton);
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Pipelines" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Screen content")).toBeInTheDocument();
    unmount();

    render(
      <AppShell runtimeMode="production" version="0.1.0">
        <p>Screen content</p>
      </AppShell>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Configuration" }),
      ).toHaveAttribute("aria-expanded", "false"),
    );
    expect(screen.getByRole("link", { name: "Submissions" })).toBeInTheDocument();
    window.localStorage.clear();
  });

  test("opens the mobile navigation dialog with the active Configuration links", async () => {
    mobileState.isMobile = true;
    const user = userEvent.setup();
    render(
      <AppShell runtimeMode="production" version="0.1.0">
        <p>Screen content</p>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Toggle navigation" }));
    const sidebar = await screen.findByRole("dialog", { name: "Navigation" });
    expect(sidebar).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data Sources" })).toHaveAttribute(
      "href",
      "/app/sources",
    );

    expect(
      within(sidebar).getByRole("button", { name: "Configuration" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(sidebar).getByRole("link", { name: "Pipelines" }),
    ).toHaveAttribute("href", "/app/pipelines");
    expect(
      within(sidebar).getByRole("link", { name: "Built-in Forms" }),
    ).toHaveAttribute("href", "/app/pages");
    expect(
      within(sidebar).getByRole("link", { name: "Settings" }),
    ).toHaveAttribute("href", "/app/settings");
  });

  test("shows the application version and a non-production runtime mode in the sidebar footer", () => {
    render(
      <AppShell runtimeMode="development" version="0.1.0">
        <p>Screen content</p>
      </AppShell>,
    );

    expect(screen.getByText("v0.1.0 (development)")).toBeInTheDocument();
    expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
  });

  test("omits the runtime mode in production", () => {
    render(
      <AppShell runtimeMode="production" version="0.1.0">
        <p>Screen content</p>
      </AppShell>,
    );

    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    expect(screen.queryByText("v0.1.0 (production)")).not.toBeInTheDocument();
  });
});
