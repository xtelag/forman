import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SourcesScreen } from "@/components/sources/sources-screen";
import type { AdminSourceSummary } from "@/client/admin-api/sources";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({
    children,
    href, ...props
  }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
  useAppNavigation: () => ({ go, refresh: vi.fn() }),
}));

const sources: AdminSourceSummary[] = [
  {
    createdAt: "2026-08-13T09:00:00.000Z",
    type: "one-shot" as const,
    pipelineCount: 2, pageCount: 0,
    enabled: true,
    sourceId: "contact-form",
    id: "form-1",
    lastSubmission: {
      createdAt: "2026-08-18T10:00:00.000Z",
      id: "submission-1",
    },
    name: "Contact",
    submissionsLast30Days: 12, totalSubmissionCount: 12, submissionsLast24Hours: 0, submissionsLast7Days: 0,
    tags: [{ color: "violet", id: "support", name: "Support" }],
    updatedAt: "2026-08-13T09:00:00.000Z",
  },
];

describe("SourcesScreen", () => {
  afterEach(() => {
    cleanup();
    go.mockReset();
    vi.useRealTimers();
  });

  test("filters by status from the URL and removes the filter with its chip", async () => {
    const user = userEvent.setup();
    render(
      <SourcesScreen
        initialQuery={{ status: "active", tagId: "support" }}
        loadSources={async () => [
          ...sources,
          { ...sources[0], enabled: false, id: "form-2", name: "Archived intake", sourceId: "archived" },
        ]}
        loadTags={async () => [{ color: "violet", id: "support", name: "Support" }]}
      />,
    );

    await screen.findByRole("table", { name: "Sources" });
    expect(screen.getAllByText("Contact").length).toBeGreaterThan(0);
    expect(screen.queryByText("Archived intake")).not.toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(chips).toHaveTextContent("Status: Active");

    await user.click(within(chips).getByRole("button", { name: "Remove filter Status: Active" }));
    expect(go).toHaveBeenCalledWith("/app/sources?tagId=support");
  });

  test("keeps the status filter when paging or changing tags", async () => {
    const user = userEvent.setup();
    render(
      <SourcesScreen
        initialQuery={{ status: "inactive" }}
        loadSources={async () => [{ ...sources[0], enabled: false }]}
        loadTags={async () => [{ color: "violet", id: "support", name: "Support" }]}
      />,
    );

    await screen.findByRole("table", { name: "Sources" });
    await user.click(screen.getByRole("button", { name: "Support" }));
    expect(go).toHaveBeenCalledWith("/app/sources?status=inactive&tagId=support");
  });

  test("keeps the collection header and table geometry visible while sources load", () => {
    render(
      <SourcesScreen
        loadSources={async () =>
          new Promise<AdminSourceSummary[]>(() => undefined)
        }
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Data Sources" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Configure how Forman accepts submissions."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading Sources");
    expect(
      document.querySelector('[data-slot="collection-loading-skeleton"]'),
    ).toBeInTheDocument();
  });

  test("shows collection rows through the shared resource table", async () => {
    const user = userEvent.setup();
    render(<SourcesScreen loadSources={async () => sources} />);

    const table = await screen.findByRole("table", { name: "Sources" });
    expect(table).toBeInTheDocument();
    expect(within(table).getByText("Contact")).toBeVisible();
    expect(within(table).queryAllByRole("link")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Create Source" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
        .filter(Boolean),
    ).toEqual([
      "Source",
      "Type",
      "Pipelines",
      "Submissions",
      "Last Submission",
      "Status",
      "Tags",
      "Actions",
    ]);
    expect(
      screen.queryByRole("columnheader", { name: "Source ID" }),
    ).not.toBeInTheDocument();

    expect(within(table).getByRole("cell", { name: "2" })).toHaveClass(
      "text-right",
    );

    expect(
      within(table).getByRole("cell", { name: /^12\b/ }),
    ).toHaveClass("text-right");

    await user.click(
      screen.getAllByRole("button", { name: "Actions for Contact" })[0],
    );
    expect(
      screen.queryByRole("link", { name: "Open Source details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "View Pipelines" }),
    ).toHaveAttribute("href", "/app/pipelines?sourceId=form-1");
    expect(
      screen.getByRole("menuitem", { name: "View Submissions" }),
    ).toHaveAttribute("href", "/app/submissions?sourceId=form-1");
    expect(screen.getByRole("menuitem", { name: "Open Source" })).toHaveAttribute(
      "href", "/app/sources/contact-form",
    );
  });

  test("keeps Sources that match any selected tag", async () => {
    const user = userEvent.setup();
    render(
      <SourcesScreen
        loadSources={async () => [
          ...sources,
          {
            ...sources[0],
            id: "form-2",
            name: "Sales intake",
            sourceId: "sales-intake",
            tags: [{ color: "blue", id: "sales", name: "Sales" }],
          },
        ]}
        loadTags={async () => [
          { color: "violet", id: "support", name: "Support" },
          { color: "blue", id: "sales", name: "Sales" },
        ]}
      />,
    );

    await screen.findByRole("table", { name: "Sources" });
    await user.click(screen.getByRole("button", { name: "Sales" }));

    expect(screen.getAllByText("Sales intake").length).toBeGreaterThan(0);
    expect(screen.queryByText("Contact")).not.toBeInTheDocument();
  });

  test("replaces the table with an empty state when no Source matches selected tags", async () => {
    const user = userEvent.setup();
    render(
      <SourcesScreen
        loadSources={async () => sources}
        loadTags={async () => [
          { color: "violet", id: "support", name: "Support" },
          { color: "blue", id: "sales", name: "Sales" },
        ]}
      />,
    );

    await screen.findByRole("table", { name: "Sources" });
    await user.click(screen.getByRole("button", { name: "Sales" }));

    expect(
      screen.getByText("No records match the selected tags."),
    ).toBeVisible();
    expect(
      screen.queryByRole("table", { name: "Sources" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rows per page")).not.toBeInTheDocument();
  });
});
