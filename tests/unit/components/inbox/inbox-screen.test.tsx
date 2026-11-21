import { MantineProvider } from "@mantine/core";
import {
  cleanup,
  render as baseRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { toast } from "sonner";
import { InboxScreen } from "@/components/inbox/inbox-screen";

function render(ui: React.ReactNode) {
  return baseRender(<MantineProvider env="test">{ui}</MantineProvider>);
}

const {
  bulkUpdateInbox,
  listInbox,
  listSources,
  listTags,
  navigationGo,
  updateInboxItem,
} = vi.hoisted(() => ({
  bulkUpdateInbox: vi.fn(),
  listInbox: vi.fn(),
  listSources: vi.fn(),
  listTags: vi.fn(),
  navigationGo: vi.fn(),
  updateInboxItem: vi.fn(),
}));

vi.mock("@/client/admin-api/inbox", () => ({
  bulkUpdateInbox,
  listInbox,
  updateInboxItem,
}));
vi.mock("@/client/admin-api/sources", () => ({
  listSources,
  listTags,
}));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go: navigationGo, refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const inboxItem = {
  createdAt: "2026-08-19T18:00:00.000Z",
  sourceId: "form-1",
  sourcePublicId: "contact-public",
  id: "inbox-1",
  preview: "John Forman",
  actionName: "Archive",
  sourceName: "Contact",
  state: "unread" as const,
  tags: [],
  trashedAt: null,
};

describe("InboxScreen", () => {
  beforeEach(() => {
    listSources.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("hides Empty Trash only after confirming the entire Trash is empty", async () => {
    listTags.mockResolvedValue([]);
    let resolve!: (value: unknown) => void;
    listInbox.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<InboxScreen initialQuery={{view: "trash"}} />);
    expect(screen.getByRole("button", {name: "Empty Trash"})).toBeDisabled();
    resolve({items: [], total: 0, hasTrash: false});
    await waitFor(() => expect(screen.queryByRole("button", {name: "Empty Trash"})).not.toBeInTheDocument());
  });

  test("keeps Empty Trash available when filters hide existing Trash items", async () => {
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({items: [], total: 0, hasTrash: true});
    render(<InboxScreen initialQuery={{view: "trash", search: "missing"}} />);
    await waitFor(() => expect(screen.getByRole("button", {name: "Empty Trash"})).toBeEnabled());
  });

  test("disables Empty Trash when loading fails", async () => {
    listTags.mockResolvedValue([]);
    listInbox.mockRejectedValue(new Error("offline"));
    render(<InboxScreen initialQuery={{view: "trash"}} />);
    await screen.findByText("Inbox could not be loaded");
    expect(screen.getByRole("button", {name: "Empty Trash"})).toBeDisabled();
  });

  test("confirms only selected Trash items and retains deletion errors", async () => {
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({items:[{...inboxItem,trashedAt:"2026-08-20T00:00:00Z"},{...inboxItem,id:"inbox-2",trashedAt:"2026-08-20T00:00:00Z"}],total:2});
    bulkUpdateInbox.mockRejectedValueOnce(new Error("offline"));
    const user=userEvent.setup();render(<InboxScreen initialQuery={{view:"trash"}} />);
    await user.click((await screen.findAllByRole("checkbox",{name:"Select inbox inbox-1"}))[0]);
    await user.click(screen.getAllByRole("checkbox",{name:"Select inbox inbox-2"})[0]);
    await user.click(screen.getAllByRole("button",{name:"Delete permanently"})[0]);
    expect(bulkUpdateInbox).not.toHaveBeenCalled();
    const dialog=screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2 selected Inbox items");
    await user.click(within(dialog).getByRole("button",{name:"Delete permanently"}));
    expect(bulkUpdateInbox).toHaveBeenCalledWith(["inbox-1","inbox-2"],"delete");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("could not be deleted");
  });

  test("opens a row with its return location but keeps checkbox clicks independent", async () => {
    listInbox.mockResolvedValue({ items: [inboxItem], total: 1 });
    listTags.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<InboxScreen initialQuery={{ state: "unread" }} />);
    const row = (await screen.findAllByText("John Forman"))[0].closest("tr")!;
    await user.click(within(row).getByRole("checkbox"));
    expect(navigationGo).not.toHaveBeenCalled();
    expect(within(row).queryByRole("link", {name:"Contact"})).not.toBeInTheDocument();
    expect(row).toHaveTextContent("Contact");
    await user.click(row);
    expect(navigationGo).toHaveBeenCalledWith(
      "/app/inbox/inbox-1?returnTo=%2Fapp%2Finbox%3Fstate%3Dunread",
    );
  });

  test("moves several selected items to Trash at once and offers Undo", async () => {
    listInbox.mockResolvedValue({
      items: [inboxItem, { ...inboxItem, id: "inbox-2" }],
      total: 2,
    });
    listTags.mockResolvedValue([]);
    bulkUpdateInbox.mockResolvedValue({ changed: 2 });
    const user = userEvent.setup();
    render(<InboxScreen />);
    const table = await screen.findByRole("table", { name: "Inbox" });
    await user.click(
      within(table).getByRole("checkbox", { name: "Select inbox on this page" }),
    );
    await user.click(screen.getAllByRole("button", { name: "Move to Trash" })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(bulkUpdateInbox).toHaveBeenCalledWith(
        ["inbox-1", "inbox-2"],
        "trash",
      ),
    );
    const [message, options] = vi.mocked(toast.success).mock.calls.at(-1)!;
    expect(message).toBe("2 items moved to Trash");
    await (
      options?.action as unknown as { onClick: () => Promise<void> }
    ).onClick();
    expect(bulkUpdateInbox).toHaveBeenLastCalledWith(
      ["inbox-1", "inbox-2"],
      "restore",
    );
  });

  test("keeps the selection when moving to Trash fails", async () => {
    listInbox.mockResolvedValue({
      items: [inboxItem, { ...inboxItem, id: "inbox-2" }],
      total: 2,
    });
    listTags.mockResolvedValue([]);
    bulkUpdateInbox.mockRejectedValueOnce(new Error("failed"));
    const user = userEvent.setup();
    render(<InboxScreen />);
    const table = await screen.findByRole("table", { name: "Inbox" });
    await user.click(
      within(table).getByRole("checkbox", { name: "Select inbox on this page" }),
    );
    await user.click(screen.getAllByRole("button", { name: "Move to Trash" })[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getAllByText("2 selected")[0]).toBeInTheDocument();
  });

  test("confirms that emptying Trash affects all items, including filtered-out items", async () => {
    listInbox.mockResolvedValue({ items: [], total: 0, hasTrash: true });
    listTags.mockResolvedValue([]);
    bulkUpdateInbox.mockResolvedValue({ changed: 3 });
    const user = userEvent.setup();
    render(
      <InboxScreen initialQuery={{ view: "trash", search: "anything" }} />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Empty Trash" }),
    );
    expect(bulkUpdateInbox).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "including those hidden by filters",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Empty Trash" }),
    );
    await waitFor(() =>
      expect(bulkUpdateInbox).toHaveBeenCalledWith([], "empty-trash"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  test("returns to the last available page after items disappear", async () => {
    listInbox.mockResolvedValue({ items: [], total: 10 });
    listTags.mockResolvedValue([]);
    render(<InboxScreen initialQuery={{ page: "2", state: "unread" }} />);
    await waitFor(() =>
      expect(navigationGo).toHaveBeenCalledWith("/app/inbox?state=unread"),
    );
  });

  test("explains a failed Inbox load and offers a retry", async () => {
    const user = userEvent.setup();
    listInbox.mockRejectedValue(new Error("unavailable"));
    listTags.mockResolvedValue([]);

    render(<InboxScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Inbox could not be loaded",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(listInbox).toHaveBeenCalledTimes(2));
  });

  test("combines selected tag filters with OR semantics", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([
      { color: "violet", id: "support", name: "Support" },
      { color: "blue", id: "sales", name: "Sales" },
    ]);
    listInbox.mockResolvedValue({ items: [], total: 0 });

    render(<InboxScreen />);

    await screen.findByRole("button", { name: "Sales" });
    const buttons = screen.getAllByRole("button");
    expect(
      buttons.indexOf(screen.getByRole("button", { name: "Sales" })),
    ).toBeLessThan(
      buttons.indexOf(screen.getByRole("button", { name: "Support" })),
    );
    expect(
      screen.getByRole("button", { name: "Clear tag filters" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Sales" }));
    await waitFor(() =>
      expect(listInbox).toHaveBeenLastCalledWith(
        expect.stringContaining("tagId=sales"),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Support" }));
    await waitFor(() =>
      expect(listInbox).toHaveBeenLastCalledWith(
        expect.stringMatching(/tagId=sales.*tagId=support/),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Sales" }));
    await waitFor(() =>
      expect(listInbox).toHaveBeenLastCalledWith(
        expect.not.stringContaining("tagId=sales"),
      ),
    );
    expect(screen.getByRole("button", { name: "Sales" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Support" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Clear tag filters" }));
    await waitFor(() =>
      expect(listInbox).toHaveBeenLastCalledWith(
        expect.not.stringContaining("tagId="),
      ),
    );
  });

  test("puts the active Inbox context in the URL and resets its page for filters", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([
      { color: "blue", id: "sales", name: "Sales" },
      { color: "violet", id: "support", name: "Support" },
    ]);
    listInbox.mockResolvedValue({ items: [], total: 0 });

    render(
      <InboxScreen
        initialQuery={{
          page: "2",
          search: "Ada",
          size: "50",
          sourceId: "source-1",
          tagId: "sales",
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Support" }));
    expect(navigationGo).toHaveBeenCalledWith(
      "/app/inbox?tagId=sales&tagId=support&sourceId=source-1&search=Ada&size=50",
    );
  });

  test("exports the complete current view without pagination", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([{ color: "blue", id: "sales", name: "Sales" }]);
    listSources.mockResolvedValue([{ id: "source-internal", name: "Contact" }]);
    listInbox.mockResolvedValue({ items: [], total: 0 });

    render(<InboxScreen />);

    await user.click(await screen.findByRole("button", { name: "Sales" }));
    await user.click(screen.getByRole("button", {name: /^Filters/}));
    await screen.findByRole("option", { name: "Contact" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by Source" }),
      "source-internal",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by state" }),
      "archived",
    );
    // Filters apply together, so the export follows only the applied view.
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/api/admin/v1/inbox/export?tagId=sales",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    const exportLink = screen.getByRole("link", { name: "Export CSV" });
    expect(exportLink).toHaveAttribute(
      "href",
      "/api/admin/v1/inbox/export?tagId=sales&sourceId=source-internal&state=archived",
    );
    expect(exportLink).not.toHaveAttribute(
      "href",
      expect.stringContaining("page="),
    );
    expect(exportLink).not.toHaveAttribute(
      "href",
      expect.stringContaining("limit="),
    );

    await user.click(screen.getByRole("tab", { name: "Trash" }));
    expect(exportLink).toHaveAttribute(
      "href",
      "/api/admin/v1/inbox/export?view=trash&tagId=sales&sourceId=source-internal",
    );
  });

  test("keeps search visible and advanced filters in a popover", async () => {
    listTags.mockResolvedValue([]);
    listSources.mockResolvedValue([]);
    listInbox.mockResolvedValue({ items: [], total: 0 });

    render(<InboxScreen />);

    const user = userEvent.setup();
    expect(await screen.findByRole("textbox", {name: "Search"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: /^Filters/}));
    const filters = await screen.findByRole("search");
    expect(
      within(filters).getByRole("combobox", { name: "Filter by Source" }),
    ).toBeInTheDocument();
    expect(
      within(filters).queryByRole("combobox", { name: "Filter by Action" }),
    ).not.toBeInTheDocument();
    expect(
      within(filters).getByRole("combobox", { name: "Filter by state" }),
    ).toBeInTheDocument();
    expect(within(filters).getByLabelText("From")).toBeInTheDocument();
    expect(within(filters).getByLabelText("To")).toBeInTheDocument();
    expect(
      within(filters).getByRole("button", { name: "Reset filters" }),
    ).toBeInTheDocument();
    expect(
      within(filters).getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
    expect(
      within(filters).getByRole("button", { name: "Apply filters" }),
    ).toHaveTextContent("Apply filters");
    expect(
      within(filters).getByRole("button", { name: "Reset filters" }),
    ).toHaveTextContent(/^Reset$/);
  });

  test("applies date filters and resets them without clearing realtime search", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({ items: [], total: 0 });

    render(<InboxScreen />);

    await screen.findByRole("heading", { name: "Inbox" });
    await user.type(
      await screen.findByLabelText("Search", {exact: true}),
      "Ada Lovelace",
    );
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", {name: /^Filters/}));
    await user.type(screen.getByLabelText("From"), "2026-08-20");
    await user.type(screen.getByLabelText("To"), "2026-08-20");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      const query = new URL(
        `https://forman.example.test${listInbox.mock.calls.at(-1)?.[0]}`,
      ).searchParams;
      expect(query.get("search")).toBe("Ada Lovelace");
      expect(query.get("from")).toBe("2026-08-20");
      expect(query.get("to")).toBe("2026-08-20");
    });

    await user.click(screen.getByRole("button", {name: /^Filters/}));
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => {
      const query = new URL(
        `https://forman.example.test${listInbox.mock.calls.at(-1)?.[0]}`,
      ).searchParams;
      expect(query.get("search")).toBe("Ada Lovelace");
      expect(query.get("from")).toBeNull();
      expect(query.get("to")).toBeNull();
    });
  });

  test("explains when no Inbox item matches selected tags", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([
      { color: "violet", id: "support", name: "Support" },
      { color: "blue", id: "sales", name: "Sales" },
    ]);
    listInbox.mockResolvedValue({ items: [], total: 0 });

    render(<InboxScreen />);

    await user.click(await screen.findByRole("button", { name: "Sales" }));

    expect(
      await screen.findByText("No Inbox items match these filters"),
    ).toBeVisible();
    expect(
      screen.queryByRole("table", { name: "Inbox" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rows per page")).not.toBeInTheDocument();
  });

  test("separates Trash from Inbox states with tabs", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({ items: [], total: 0 });

    render(<InboxScreen />);

    expect(await screen.findByRole("tab", { name: "Inbox" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(await screen.findByRole("button", {name: /^Filters/}));
    expect(
      screen.getByRole("combobox", { name: "Filter by state" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("tab", { name: "Trash" }));

    await waitFor(() =>
      expect(listInbox).toHaveBeenLastCalledWith(
        expect.stringContaining("view=trash"),
      ),
    );
    expect(
      screen.queryByRole("combobox", { name: "Filter by state" }),
    ).not.toBeInTheDocument();
  });

  test("prevents a regression that applies a bulk action to only one selected Inbox item", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({
      items: [
        inboxItem,
        { ...inboxItem, id: "inbox-2", preview: "Ada Lovelace" },
      ],
      total: 2,
    });
    bulkUpdateInbox.mockResolvedValue(undefined);

    render(<InboxScreen />);

    await user.click(
      await screen.findByRole("checkbox", { name: "Select inbox on this page" }),
    );
    await user.click(screen.getAllByRole("button", { name: "Mark as read" })[0]);

    expect(bulkUpdateInbox).toHaveBeenCalledWith(
      ["inbox-1", "inbox-2"],
      "read",
    );
    await waitFor(() => expect(listInbox).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("button", { name: "Mark as read" }),
    ).not.toBeInTheDocument();
  });

  test("moves one selected item to Trash immediately and offers Undo", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({
      items: [inboxItem],
      total: 1,
    });
    updateInboxItem.mockResolvedValue(undefined);

    render(<InboxScreen />);

    const table = await screen.findByRole("table", { name: "Inbox" });
    await user.click(
      within(table).getByRole("checkbox", { name: "Select inbox inbox-1" }),
    );
    await user.click(screen.getAllByRole("button", { name: "Move to Trash" })[0]);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(updateInboxItem).toHaveBeenCalledWith("inbox-1", "trash"),
    );
    const options = vi.mocked(toast.success).mock.calls.at(-1)?.[1];
    expect(options?.action).toMatchObject({ label: "Undo" });
    await (
      options?.action as unknown as { onClick: () => Promise<void> }
    ).onClick();
    expect(updateInboxItem).toHaveBeenLastCalledWith("inbox-1", "restore");
  });

  test("renders a plain preview and accessible row actions", async () => {
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({ items: [inboxItem], total: 1 });

    render(<InboxScreen />);

    const table = await screen.findByRole("table", { name: "Inbox" });
    expect(table).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
        .filter(Boolean),
    ).toEqual(["Preview", "Source", "Received", "Tags", "Actions"]);
    expect(within(table).getByText("John Forman")).toBeVisible();
    expect(within(table).queryAllByRole("link")).toHaveLength(0);
    expect(
      within(table).queryByRole("button", { name: /Actions for Inbox item/ }),
    ).not.toBeInTheDocument();
  });
  test("keeps Source tags in their own column and opens all tags without navigating", async () => {
    const tags = [{id:"a", name:"Sales", color:"blue" as const}, {id:"b", name:"Support", color:"teal" as const}, {id:"c", name:"Long hidden tag", color:"rose" as const}];
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({items:[{...inboxItem, tags}],total:1});
    render(<InboxScreen />);
    const table = await screen.findByRole("table", {name:"Inbox"});
    const cells = within(table).getAllByRole("row")[1].querySelectorAll("td");
    expect(cells[1]).not.toHaveTextContent("Sales");
    expect(cells[4]).toHaveTextContent("Sales");
    const user = userEvent.setup();
    navigationGo.mockClear();
    await user.click(within(table).getByRole("button", {name:"Show all 3 tags"}));
    await user.click(await screen.findByText("Long hidden tag"));
    expect(navigationGo).not.toHaveBeenCalled();
  });


  test("rejects a reversed date range before filtering", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({ items: [], total: 0 });
    render(<InboxScreen />);
    await user.click(await screen.findByRole("button", {name: /^Filters/}));
    await user.type(await screen.findByLabelText("From"), "2026-09-29");
    await user.type(screen.getByLabelText("To"), "2026-09-01");
    const calls = listInbox.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "To must be on or after From.",
    );
    expect(screen.getByLabelText("To")).toHaveFocus();
    expect(listInbox).toHaveBeenCalledTimes(calls);
    await user.clear(screen.getByLabelText("To"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("resets Source and state together with the other filters", async () => {
    const user = userEvent.setup();
    listTags.mockResolvedValue([]);
    listInbox.mockResolvedValue({ items: [], total: 0 });
    render(<InboxScreen initialQuery={{ sourceId: "source-1" }} />);
    await user.click(await screen.findByRole("button", {name: /^Filters/}));
    const reset = await screen.findByRole("button", { name: "Reset filters" });
    expect(reset).toBeEnabled();
    await user.click(reset);
    expect(navigationGo).toHaveBeenCalledWith("/app/inbox");
  });
});
