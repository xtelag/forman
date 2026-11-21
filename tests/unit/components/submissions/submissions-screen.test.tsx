import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AdminSourceSummary } from "@/client/admin-api/sources";
import { AdminApiError } from "@/client/admin-api/client";
import { SubmissionsScreen } from "@/components/submissions/submissions-screen";
import type { AdminSubmissionsResponse } from "@/shared/contracts/admin";

const { go, listTags, refresh } = vi.hoisted(() => ({
  go: vi.fn(),
  listTags: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/client/admin-api/sources", () => ({
  listSources: vi.fn(),
  listTags,
}));

vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go, refresh }),
}));

const sources: AdminSourceSummary[] = [
  {
    createdAt: "2026-08-13T09:00:00.000Z",
    type: "one-shot" as const,
    pipelineCount: 0,
    pageCount: 0,
    enabled: true,
    fieldDefinitionMode: "json-schema",
    fieldDefinitionSource:
      '{"type":"object","properties":{"name":{"type":"string"},"email":{"type":"string","format":"email"},"interests":{"type":"string"}},"required":["name","email"],"additionalProperties":false}',
    sourceId: "contact-form",
    id: "form-1",
    lastSubmission: null,
    name: "Contact",
    submissionsLast30Days: 0,
    totalSubmissionCount: 0,
    submissionsLast24Hours: 0,
    submissionsLast7Days: 0,
    updatedAt: "2026-08-13T09:00:00.000Z",
  },
];

const submissions: AdminSubmissionsResponse = {
  items: [
    {
      createdAt: "2026-08-13T10:00:00.000Z",
      sourceId: "form-1",
      sourceName: "Contact",
      sourcePublicId: "contact-public",
      id: "submission-1",
      payload: {
        email: ["person@example.test"],
        interests: ["Sources", "Privacy"],
      },
      referer: "https://example.test/contact",
      tags: [{ color: "teal", id: "tag-1", name: "Website" }],
      userAgent: "Forman test",
    },
  ],
  total: 1,
};

describe("SubmissionsScreen", () => {
  beforeEach(() => {
    listTags.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    go.mockReset();
    listTags.mockReset();
    refresh.mockReset();
  });

  test("does not resurrect selection when returning to an earlier filter", async () => {
    const user = userEvent.setup();
    const props = { loadSources: async () => sources, loadSubmissions: async () => submissions };
    const { rerender } = render(<SubmissionsScreen {...props} initialQuery={{}} />);
    await user.click(await screen.findByRole("checkbox", { name: "Select submission submission-1" }));
    expect(screen.getAllByText("1 selected")).toHaveLength(2);
    rerender(<SubmissionsScreen {...props} initialQuery={{ search: "changed" }} />);
    await screen.findByRole("table", { name: "Submissions" });
    rerender(<SubmissionsScreen {...props} initialQuery={{}} />);
    expect(await screen.findByRole("checkbox", { name: "Select submission submission-1" })).not.toBeChecked();
    expect(screen.queryAllByText("1 selected")).toHaveLength(0);
  });

  test.each([
    [{}, "No Submissions yet"],
    [{ sourceId: "form-1" }, "No Submissions for this Source"],
    [
      { sourceId: "form-1", from: "2026-11-01" },
      "No Submissions match these filters",
    ],
    [{ period: "24h" }, "No Submissions match these filters"],
    [
      { sourceId: "form-1", tagId: "tag-1" },
      "No Submissions match these filters",
    ],
  ])(
    "empty linked results distinguish context and active filters: %j",
    async (initialQuery, title) => {
      render(
        <SubmissionsScreen
          initialQuery={initialQuery}
          loadSources={async () => sources}
          loadSubmissions={async () => ({ items: [], total: 0 })}
        />,
      );
      expect(await screen.findByRole("heading", { name: title })).toBeVisible();
      expect(
        screen.queryByText("Adjust the filters or select another Source."),
      ).not.toBeInTheDocument();
    },
  );

  test("synchronizes the top and bottom collection controls", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
      />,
    );
    const top = await screen.findByRole("group", {
      name: "Top table controls",
    });
    const bottom = screen.getByRole("group", { name: "Bottom table controls" });
    expect(within(top).getByText("1–1 of 1")).toBeInTheDocument();
    expect(within(bottom).getByText("1–1 of 1")).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Select submissions on this page" }),
    );
    expect(within(top).getByText("1 selected")).toBeInTheDocument();
    expect(within(bottom).getByText("1 selected")).toBeInTheDocument();
    await user.click(
      within(top).getByRole("button", { name: "Delete selected" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete 1 Submission");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await user.click(within(bottom).getByRole("button", { name: "Clear" }));
    expect(within(top).queryByText("1 selected")).not.toBeInTheDocument();
    expect(within(bottom).queryByText("1 selected")).not.toBeInTheDocument();
  });

  test("selects only completed records from a mixed session collection", async () => {
    const user = userEvent.setup();
    const completed = {
      ...submissions.items[0],
      type: "session" as const,
      state: "completed" as const,
    };
    const draft = {
      ...completed,
      id: "session-draft",
      state: "draft" as const,
    };
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={async () => ({
          items: [completed, draft],
          total: 2,
          deletableTotal: 1,
        })}
      />,
    );
    const table = await screen.findByRole("table", { name: "Submissions" });
    expect(
      within(table).getByRole("checkbox", {
        name: "Select submission session-draft",
      }),
    ).toBeDisabled();
    await user.click(
      within(table).getByRole("checkbox", { name: "Select submissions on this page" }),
    );
    expect(screen.getAllByText("1 selected")).toHaveLength(2);
    expect(
      within(table).getByRole("checkbox", {
        name: "Select submission session-draft",
      }),
    ).not.toBeChecked();
  });

  test("searches automatically without a duplicate chip and keeps focus across result updates", async () => {
    const user = userEvent.setup();
    const loadSources = async () => sources;
    const loadSubmissions = async () => submissions;
    const { rerender } = render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={loadSources}
        loadSubmissions={loadSubmissions}
      />,
    );
    await screen.findByRole("table", { name: "Submissions" });
    const search = screen.getByRole("textbox", { name: "Search" });
    await user.type(search, "sample");
    await waitFor(() =>
      expect(go).toHaveBeenCalledWith("/app/submissions?search=sample", {
        replace: true,
      }),
    );
    await user.type(search, " more");
    rerender(
      <SubmissionsScreen
        initialQuery={{ search: "sample" }}
        loadSources={loadSources}
        loadSubmissions={loadSubmissions}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Search" })).toBe(search);
    expect(search).toHaveFocus();
    expect(search).toHaveValue("sample more");
    expect(
      screen.queryByRole("button", { name: /Remove filter Search/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(go).toHaveBeenCalledWith("/app/submissions?search=sample+more", {
        replace: true,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(go).toHaveBeenLastCalledWith("/app/submissions", { replace: true });
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
  });

  test("preserves unsubmitted search when a tag or filter chip changes", async () => {
    listTags.mockResolvedValue([{ color: "blue", id: "sales", name: "Sales" }]);
    const user = userEvent.setup();
    render(
      <SubmissionsScreen
        initialQuery={{ sourceId: "form-1" }}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
      />,
    );
    await screen.findByRole("table", { name: "Submissions" });
    await user.type(screen.getByRole("textbox", { name: "Search" }), "draft");
    await user.click(screen.getByRole("button", { name: "Sales" }));
    expect(go).toHaveBeenLastCalledWith(
      "/app/submissions?sourceId=form-1&tagId=sales&search=draft",
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(go).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Remove filter Source: Contact" }),
    );
    expect(go).toHaveBeenLastCalledWith("/app/submissions?search=draft");
  });

  test("keeps column associations accessible during bulk selection", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
      />,
    );
    const table = await screen.findByRole("table", { name: "Submissions" });
    await user.click(
      screen.getByRole("checkbox", { name: "Select submissions on this page" }),
    );
    const sourceHeader = within(table).getByRole("columnheader", {
      name: "Source",
    });
    expect(sourceHeader.tagName).toBe("TH");
    expect(
      within(table).getByRole("cell", { name: "Contact" }),
    ).toBeInTheDocument();
  });

  test("keeps advanced filters collapsed and preserves their drafts when toggled", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
      />,
    );
    await screen.findByRole("table", { name: "Submissions" });
    expect(screen.getByRole("textbox", { name: "Search" })).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Source" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Type" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Type" }),
      "session",
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue(
      "session",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(go).toHaveBeenCalledWith("/app/submissions?type=session");
  });

  test("removes an active filter without clearing the remaining context", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionsScreen
        initialQuery={{ sourceId: "form-1", search: "hello", tagId: "sales" }}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
      />,
    );
    await screen.findByRole("table", { name: "Submissions" });
    await user.click(
      screen.getByRole("button", { name: "Remove filter Source: Contact" }),
    );
    expect(go).toHaveBeenCalledWith(
      "/app/submissions?search=hello&tagId=sales",
    );
  });

  test("shows only fixed metadata columns without payload fragments", async () => {
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Submissions" }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Submissions" });
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("button", { name: "Reset filters" }),
    ).toBeDisabled();
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

    expect(table).toHaveTextContent("Website");
    expect(table).not.toHaveTextContent("Success");
    expect(table).not.toHaveTextContent("contact-public");
    expect(table).not.toHaveTextContent("person@example.test");
    expect(table).not.toHaveTextContent("Sources, Privacy");
    expect(within(table).queryAllByRole("link")).toHaveLength(0);
  });

  test("opens the row with preserved filters and keeps selection independent", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionsScreen
        initialQuery={{ sourceId: "form-1", search: "person@example.test" }}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
      />,
    );
    const table = await screen.findByRole("table", { name: "Submissions" });
    const row = within(table).getAllByRole("row")[1];
    await user.click(within(row).getByRole("checkbox"));
    expect(go).not.toHaveBeenCalled();
    expect(
      within(row).queryByRole("link", { name: "Contact" }),
    ).not.toBeInTheDocument();
    expect(row).toHaveTextContent("Contact");
    await user.click(row);
    expect(go).toHaveBeenCalledWith(
      "/app/submissions/submission-1?returnTo=%2Fapp%2Fsubmissions%3FsourceId%3Dform-1%26search%3Dperson%2540example.test",
    );
    expect(
      within(table).queryByRole("button", { name: /Actions for submission/ }),
    ).not.toBeInTheDocument();
  });

  test("serializes filters into the portable navigation URL and resets them", async () => {
    const user = userEvent.setup();
    const loadSubmissions = vi.fn().mockResolvedValue(submissions);
    render(
      <SubmissionsScreen
        initialQuery={{
          sourceId: "form-1",
          search: "old",
          from: "2026-08-01",
          page: "2",
          to: "2026-08-13",
        }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await screen.findByRole("table", { name: "Submissions" });
    expect(loadSubmissions).toHaveBeenCalledWith({
      sourceId: "form-1",
      from: "2026-08-01",
      limit: 10,
      offset: 10,
      search: "old",
      to: "2026-08-13",
    });
    await user.clear(screen.getByLabelText("Search"));
    await user.type(screen.getByLabelText("Search"), "manager@example.test");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(go).toHaveBeenCalledWith(
      "/app/submissions?sourceId=form-1&from=2026-08-01&search=manager%40example.test&to=2026-08-13",
    );
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("link", { name: "Reset filters" })).toHaveAttribute(
      "href",
      "/app/submissions",
    );
    expect(
      screen.queryByRole("link", { name: "Export CSV" }),
    ).not.toBeInTheDocument();
  });

  test("limits the collection to the last 24 hours and removes the window with its chip", async () => {
    const user = userEvent.setup();
    const loadSubmissions = vi.fn().mockResolvedValue(submissions);
    const before = Date.now();

    render(
      <SubmissionsScreen
        initialQuery={{ period: "24h", state: "completed" }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await screen.findByRole("table", { name: "Submissions" });
    const query = loadSubmissions.mock.calls[0][0];
    expect(query).toMatchObject({ limit: 10, offset: 0, state: "completed" });
    const from = Date.parse(query.from);
    expect(from).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1_000);
    expect(from).toBeLessThanOrEqual(Date.now() - 24 * 60 * 60 * 1_000);

    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(chips).toHaveTextContent("Received: Last 24 hours");
    await user.click(
      within(chips).getByRole("button", {
        name: "Remove filter Received: Last 24 hours",
      }),
    );
    expect(go).toHaveBeenCalledWith("/app/submissions?state=completed");
  });

  test("replaces the 24-hour window with an explicit date range", async () => {
    const loadSubmissions = vi.fn().mockResolvedValue(submissions);

    render(
      <SubmissionsScreen
        initialQuery={{ period: "24h", from: "2026-08-01" }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await screen.findByRole("table", { name: "Submissions" });
    expect(loadSubmissions).toHaveBeenCalledWith({
      from: "2026-08-01",
      limit: 10,
      offset: 0,
    });
    expect(
      screen.getByRole("group", { name: "Active filters" }),
    ).toHaveTextContent("From: 2026-08-01");
    expect(
      screen.queryByText("Received: Last 24 hours"),
    ).not.toBeInTheDocument();
  });

  test("filters Submissions by tags and preserves them in the navigation URL", async () => {
    const user = userEvent.setup();
    const loadSubmissions = vi.fn().mockResolvedValue(submissions);
    listTags.mockResolvedValue([
      { color: "blue", id: "sales", name: "Sales" },
      { color: "violet", id: "support", name: "Support" },
    ]);

    render(
      <SubmissionsScreen
        initialQuery={{ tagId: "sales" }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await screen.findByRole("table", { name: "Submissions" });
    expect(loadSubmissions).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      tagIds: ["sales"],
    });
    expect(screen.getByRole("button", { name: "Sales" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Support" }));

    expect(go).toHaveBeenCalledWith(
      "/app/submissions?tagId=sales&tagId=support",
    );
  });

  test("reloads submissions when navigation changes the filters", async () => {
    const loadSubmissions = vi.fn().mockResolvedValue(submissions);
    const view = render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await screen.findByRole("table", { name: "Submissions" });
    view.rerender(
      <SubmissionsScreen
        initialQuery={{ search: "manager@example.test" }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await waitFor(() =>
      expect(loadSubmissions).toHaveBeenLastCalledWith({
        limit: 10,
        offset: 0,
        search: "manager@example.test",
      }),
    );
  });

  test("clears the visible filter controls when navigation resets the query", async () => {
    const loadSubmissions = vi.fn().mockResolvedValue(submissions);
    const view = render(
      <SubmissionsScreen
        initialQuery={{ sourceId: "form-1", search: "manager@example.test" }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await screen.findByRole("table", { name: "Submissions" });
    view.rerender(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await waitFor(() =>
      expect(loadSubmissions).toHaveBeenLastCalledWith({
        limit: 10,
        offset: 0,
      }),
    );
    expect(screen.getByLabelText("Source", { exact: true })).toHaveValue("all");
    expect(screen.getByLabelText("Search")).toHaveValue("");
  });

  test("offers an immediate retry when the collection request fails", async () => {
    const loadSubmissions = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError(500, "offline"))
      .mockResolvedValueOnce(submissions);
    const user = userEvent.setup();
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("table", { name: "Submissions" }),
    ).toBeInTheDocument();
    expect(loadSubmissions).toHaveBeenCalledTimes(2);
  });

  test("keeps the same metadata columns when filtered to one Source", async () => {
    render(
      <SubmissionsScreen
        initialQuery={{ sourceId: "form-1" }}
        loadSources={async () => sources}
        loadSubmissions={async () => ({
          ...submissions,
          items: [
            {
              ...submissions.items[0],
              payload: { email: ["person@example.test"] },
            },
          ],
        })}
      />,
    );

    const table = await screen.findByRole("table", { name: "Submissions" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
        .filter(Boolean),
    ).toEqual(["Received", "Source", "Type", "State", "Tags", "Actions"]);
    expect(table).not.toHaveTextContent("person@example.test");
  });

  test("paginates with a URL page size and deletes a filtered selection with exclusions", async () => {
    const user = userEvent.setup();
    const deleteSelection = vi.fn().mockResolvedValue({ deleted: 77 });
    const loadSubmissions = vi
      .fn()
      .mockResolvedValue({ ...submissions, total: 78 });
    render(
      <SubmissionsScreen
        deleteSubmissionSelection={deleteSelection}
        initialQuery={{ page: "2", size: "50" }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    const table = await screen.findByRole("table", { name: "Submissions" });
    expect(loadSubmissions).toHaveBeenCalledWith({ limit: 50, offset: 50 });
    expect(screen.getAllByText("51–51 of 78")).toHaveLength(2);
    await user.click(
      within(table).getByRole("checkbox", { name: "Select submissions on this page" }),
    );
    expect(screen.getAllByText("1 selected")).toHaveLength(2);
    await user.click(within(screen.getByRole("group", { name: "Top table controls" })).getByRole("button", { name: "Select all 78" }));
    await screen.findAllByText("78 selected");
    await user.click(
      within(await screen.findByRole("table", { name: "Submissions" })).getByRole("checkbox", {
        name: "Select submission submission-1",
      }),
    );
    expect(screen.getAllByText("77 selected")).toHaveLength(2);
    expect(
      within(screen.getByRole("table", { name: "Submissions" })).getByRole("checkbox", { name: "Select submissions on this page" }),
    ).not.toBeChecked();
    await user.click(
      within(
        screen.getByRole("group", { name: "Top table controls" }),
      ).getByRole("button", { name: "Delete selected" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete 77 Submissions permanently?");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    await waitFor(() =>
      expect(deleteSelection).toHaveBeenCalledWith({
        excludedIds: ["submission-1"],
        filter: { state: "completed" },
        snapshotBefore: expect.any(String),
        type: "filter",
      }),
    );
  });

  test("keeps a failed deletion inside the confirmation and preserves selection", async () => {
    const user = userEvent.setup();
    const remove = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
        deleteSubmissionSelection={remove}
      />,
    );
    const table = await screen.findByRole("table", { name: "Submissions" });
    await user.click(
      within(table).getByRole("checkbox", {
        name: "Select submission submission-1",
      }),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "Top table controls" }),
      ).getByRole("button", { name: "Delete selected" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "could not be deleted",
    );
    expect(remove).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByText("1 selected")).toHaveLength(2);
  });

  test("blocks dismissal and duplicate deletion while the request is pending", async () => {
    const user = userEvent.setup();
    let finish!: (value: { deleted: number }) => void;
    const remove = vi.fn(
      () =>
        new Promise<{ deleted: number }>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <SubmissionsScreen
        initialQuery={{}}
        loadSources={async () => sources}
        loadSubmissions={async () => submissions}
        deleteSubmissionSelection={remove}
      />,
    );
    const table = await screen.findByRole("table", { name: "Submissions" });
    await user.click(
      within(table).getByRole("checkbox", {
        name: "Select submission submission-1",
      }),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "Top table controls" }),
      ).getByRole("button", { name: "Delete selected" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Deleting…" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
    finish({ deleted: 1 });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });

  test("uses 50 rows per page when the URL requests it", async () => {
    const loadSubmissions = vi
      .fn()
      .mockResolvedValue({ ...submissions, total: 78 });
    render(
      <SubmissionsScreen
        initialQuery={{ page: "2", size: "50" }}
        loadSources={async () => sources}
        loadSubmissions={loadSubmissions}
      />,
    );

    await screen.findByRole("table", { name: "Submissions" });

    expect(loadSubmissions).toHaveBeenCalledWith({ limit: 50, offset: 50 });
    expect(screen.getAllByText("51–51 of 78")).toHaveLength(2);
  });
});

afterEach(cleanup);

test("selects completed results elsewhere when this page contains only drafts", async () => {
  const user = userEvent.setup();
  render(<SubmissionsScreen loadTags={async () => []} initialQuery={{}} loadSources={async () => sources}
    loadSubmissions={async () => ({items: [{...submissions.items[0], type:"session", state:"draft"}], total: 30, deletableTotal: 20})} />);
  const top = await screen.findByRole("group", {name:"Top table controls"});
  await user.click(within(top).getByRole("button", {name:"Select all 20"}));
  expect(within(top).getByText("20 selected")).toBeVisible();
  expect(screen.getByRole("checkbox", {name:"Select submission submission-1"})).not.toBeChecked();
});

test.each([
  ["form-1", sources, "Open Source", "/app/sources/contact-form"],
  [undefined, [], "Create Source", null],
  [undefined, sources, "View Sources", "/app/sources"],
] as const)("empty Submissions offer the correct next step (%s)", async (sourceId, catalog, label, href) => {
  render(<SubmissionsScreen loadTags={async () => []} initialQuery={{sourceId}} loadSources={async () => [...catalog]}
    loadSubmissions={async () => ({items:[], total:0})} />);
  if (href) expect(await screen.findByRole("link", {name:label})).toHaveAttribute("href",href);
  else expect(await screen.findByRole("button", {name:label})).toBeVisible();
});
