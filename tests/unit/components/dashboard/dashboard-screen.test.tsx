import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import type { AdminDashboardResponse } from "@/shared/contracts/admin";

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock("@mantine/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mantine/hooks")>()),
  useMediaQuery: () => mobile.value,
}));

const { go, refresh } = vi.hoisted(() => ({ go: vi.fn(), refresh: vi.fn() }));

vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({
    children,
    className,
    href,
    ...properties
  }: {
    children: React.ReactNode;
    className?: string;
    href: string;
  } & Omit<React.ComponentProps<"a">, "children" | "className" | "href">) => (
    <a className={className} href={href} {...properties}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go, refresh }),
}));

const dashboard: AdminDashboardResponse = {
  isInitialPassword: true,
  summary: {
    activeSourceCount: 2,
    failedActionCount: 4,
    waitingCallbackCount: 2,
    recentSubmissions: [],
    submissionsLast24Hours: 3,
    submissionsLast7Days: 8,
    submissionsLast30Days: 12,
    totalSubmissionCount: 12,
  },
};

describe("DashboardScreen", () => {
  test.each([true, false])(
    "limits dashboard preview appropriately (mobile=%s)",
    async (isMobile) => {
      mobile.value = isMobile;
      const recentSubmissions = Array.from({ length: 10 }, (_, index) => ({
        id: "recent-" + index,
        sourceId: "source",
        sourcePublicId: "public",
        sourceName: "Source " + index,
        createdAt: "2026-08-21T13:00:00.000Z",
        payload: {},
        referer: null,
        userAgent: null,
        tags: [],
        type: "one-shot" as const,
        state: "completed" as const,
      }));
      render(
        <DashboardScreen
          loadDashboard={async () => ({
            ...dashboard,
            summary: { ...dashboard.summary, recentSubmissions },
          })}
        />,
      );
      await screen.findAllByText("Source 0");
      if (isMobile) {
        const list = screen.getByRole("list", { name: "Recent Submissions" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(5);
        expect(within(list).getAllByRole("link")[0]).toHaveAttribute(
          "href",
          "/app/submissions/recent-0?returnTo=%2Fapp",
        );
        expect(screen.queryByText("Source 5")).not.toBeInTheDocument();
        expect(within(list).queryByRole("button")).not.toBeInTheDocument();
      } else {
        const table = screen.getByRole("table", { name: "Recent Submissions" });
        expect(within(table).getAllByRole("row")).toHaveLength(11);
      }
      expect(
        screen.getByRole("link", { name: "View all Submissions" }),
      ).toHaveAttribute("href", "/app/submissions");
    },
  );

  test("links every summary card to its matching collection", async () => {
    render(<DashboardScreen loadDashboard={async () => dashboard} />);
    const failed = await screen.findByRole("link", { name: /Failed Actions/ });
    expect(failed).toHaveAttribute(
      "href",
      "/app/pipeline-runs?actionStatus=failed_24h",
    );
    expect(failed.closest('[data-slot="card"]')).toHaveTextContent("4");
    const waiting = screen.getByRole("link", { name: "Waiting Callbacks" });
    expect(waiting).toHaveAttribute("href", "/app/callbacks");
    expect(waiting.closest('[data-slot="card"]')).toHaveTextContent("2");
    expect(waiting).toHaveAccessibleDescription("2");
    for (const [name, href] of [
      ["Active Sources", "/app/sources?status=active"],
      ["Stored Submissions", "/app/submissions"],
      ["Submissions Last 24 hours", "/app/submissions?period=24h"],
      [
        "Failed Actions Last 24 hours",
        "/app/pipeline-runs?actionStatus=failed_24h",
      ],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  test("colors problem counts only when they are not zero", async () => {
    render(
      <DashboardScreen
        loadDashboard={async () => ({
          ...dashboard,
          summary: { ...dashboard.summary, failedActionCount: 0 },
        })}
      />,
    );
    const failed = await screen.findByRole("link", { name: /Failed Actions/ });
    expect(failed.innerHTML).not.toContain("--mantine-color-red");
    const waiting = screen.getByRole("link", { name: "Waiting Callbacks" });
    expect(waiting.innerHTML).toContain("--mantine-color-yellow");
  });

  test("shows a retry warning without hiding loaded data after a refresh failure", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ...dashboard, isInitialPassword: false })
      .mockRejectedValueOnce(new Error("secret backend error"))
      .mockResolvedValueOnce({ ...dashboard, isInitialPassword: false });
    render(<DashboardScreen loadDashboard={load} />);
    await screen.findByText("Active Sources");
    await act(async () => window.dispatchEvent(new Event("focus")));
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent(/Showing data from/);
    expect(warning).not.toHaveTextContent("secret backend error");
    expect(screen.getByText("Active Sources")).toBeInTheDocument();
    fireEvent.click(within(warning).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Active Sources")).toBeInTheDocument();
  });

  afterEach(() => {
    cleanup();
    mobile.value = false;
    go.mockReset();
    refresh.mockReset();
    vi.useRealTimers();
  });

  test("keeps the dashboard header visible while its resources are loading", () => {
    vi.useFakeTimers();
    render(
      <DashboardScreen
        loadDashboard={async () =>
          new Promise<AdminDashboardResponse>(() => undefined)
        }
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard");
  });

  test("presents the workspace overview, summary, and a submissions-only next action", async () => {
    render(<DashboardScreen loadDashboard={async () => dashboard} />);

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Workspace overview")).not.toBeInTheDocument();
    const activitySummary = screen.getByRole("region", {
      name: "Activity summary",
    });
    expect(activitySummary).toHaveTextContent("Active Sources");
    expect(activitySummary).toHaveTextContent("2");
    expect(activitySummary).not.toHaveTextContent("hosted");
    expect(activitySummary).not.toHaveTextContent("Total");
    expect(activitySummary).not.toHaveTextContent("(24 h)");
    expect(activitySummary).not.toHaveTextContent("Last 7 days");
    expect(activitySummary).not.toHaveTextContent("Last 30 days");
    const summaryCards = activitySummary.querySelectorAll('[data-slot="card"]');
    expect(summaryCards).toHaveLength(5);
    expect([...summaryCards].map((card) => card.textContent)).toEqual([
      "Active Sources2\u00a0",
      "Stored Submissions12\u00a0",
      "Submissions3Last 24 hours",
      "Failed Actions4Last 24 hours",
      "Waiting Callbacks2\u00a0",
    ]);
    expect(summaryCards[4]).not.toHaveTextContent(
      "Includes Email Confirmation",
    );
    const initialPasswordAlert = screen.getByRole("alert");
    expect(initialPasswordAlert).toHaveTextContent(
      "Initial password is still active. Change the password.",
    );
    const changePasswordLink = screen.getByRole("link", {
      name: "Change the password",
    });
    expect(changePasswordLink).toHaveAttribute(
      "href",
      "/app/settings#password",
    );
    const emptyState = screen.getByRole("status", {
      name: "",
    });
    expect(emptyState).toHaveTextContent("No Submissions yet");
    expect(emptyState.parentElement).not.toHaveClass("p-0");
    expect(
      screen.getByRole("link", { name: "View all Submissions" }),
    ).toHaveAttribute("href", "/app/submissions");
  });

  test("hides the all-submissions action when no submissions exist", async () => {
    render(
      <DashboardScreen
        loadDashboard={async () => ({
          ...dashboard,
          summary: {
            ...dashboard.summary,
            submissionsLast24Hours: 0,
            submissionsLast7Days: 0,
            submissionsLast30Days: 0,
            totalSubmissionCount: 0,
          },
        })}
      />,
    );

    await screen.findByRole("heading", { name: "Recent Submissions" });

    expect(
      screen.queryByRole("link", { name: "View all Submissions" }),
    ).not.toBeInTheDocument();
  });

  test("renders recent submissions in the same single-row table format", async () => {
    const user = userEvent.setup();
    const recentDashboard = {
      ...dashboard,
      summary: {
        ...dashboard.summary,
        recentSubmissions: [
          {
            createdAt: "2026-08-21T13:00:00.000Z",
            id: "submission-1",
            payload: {
              email: "john.forman@example.com",
              note: "Hello",
              purpose: "Newsletter",
            },
            referer: null,
            sourceId: "source-1",
            sourceName: "Contact",
            sourcePublicId: "contact",
            tags: [{ color: "teal", id: "tag-1", name: "Website" }],
            userAgent: null,
          },
        ],
      },
    } as AdminDashboardResponse;
    render(<DashboardScreen loadDashboard={async () => recentDashboard} />);

    const table = await screen.findByRole("table", {
      name: "Recent Submissions",
    });

    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent).filter(Boolean)).toEqual(
      ["Received", "Source", "Type", "State", "Tags", "Actions"],
    );

    expect(
      within(table).queryByRole("columnheader", { name: "Source ID" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: "Pipelines" }),
    ).not.toBeInTheDocument();

    expect(within(table).queryAllByRole("link")).toHaveLength(0);
    expect(table).toHaveTextContent("Website");
    expect(table).not.toHaveTextContent("contact");
    expect(table).not.toHaveTextContent("john.forman@example.com");
    expect(table).not.toHaveTextContent("Hello");
    expect(
      within(table).queryByRole("columnheader", { name: "Purpose" }),
    ).not.toBeInTheDocument();
    expect(table).not.toHaveTextContent("submission-1");

    await user.click(within(table).getByText("Website"));
    expect(go).toHaveBeenCalledWith(
      "/app/submissions/submission-1?returnTo=%2Fapp",
    );
    expect(
      within(table).queryByRole("button", { name: /Actions for submission/ }),
    ).not.toBeInTheDocument();
  });

  test("explains dashboard loading failures and retries both resources", async () => {
    const loadDashboard = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...dashboard, isInitialPassword: false });

    render(<DashboardScreen loadDashboard={loadDashboard} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dashboard could not be loaded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Active Sources")).toBeInTheDocument();
    expect(loadDashboard).toHaveBeenCalledTimes(2);
  });
});
