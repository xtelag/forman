import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { InboxItemScreen } from "@/components/inbox/inbox-item-screen";

const { getInboxItem, updateInboxItem, navigationGo } = vi.hoisted(() => ({
  getInboxItem: vi.fn(),
  navigationGo: vi.fn(),
  updateInboxItem: vi.fn(),
}));

vi.mock("@/client/admin-api/inbox", () => ({
  getInboxItem,
  updateInboxItem,
}));
vi.mock("@/components/layout/app-link", () => ({
  useAppNavigation: () => ({ go: navigationGo }),
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("InboxItemScreen", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("confirms permanent deletion and keeps failures inside the dialog", async () => {
    getInboxItem.mockResolvedValue({id:"delete-item",createdAt:"2026-08-19T18:00:00Z",sourceName:"Contact",actionName:"Inbox",payloadJson:"{}",preview:"Test",state:"read",trashedAt:"2026-08-20T00:00:00Z",tags:[]});
    updateInboxItem.mockRejectedValueOnce(new Error("offline"));
    const user=userEvent.setup(); render(<InboxItemScreen itemId="delete-item" />);
    await user.click(await screen.findByRole("button",{name:"Inbox item actions"}));
    await user.click(screen.getByRole("menuitem",{name:"Delete permanently"}));
    expect(updateInboxItem).not.toHaveBeenCalled();
    const dialog=screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button",{name:"Delete permanently"}));
    expect(updateInboxItem).toHaveBeenCalledWith("delete-item","delete");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("could not be deleted");
  });

  test("groups Inbox item actions in a kebab menu", async () => {
    const user = userEvent.setup();
    getInboxItem.mockResolvedValue({
      createdAt: "2026-08-19T18:00:00.000Z",
      sourceId: "internal-form-id",
      sourcePublicId: "contact-public",
      id: "inbox-1",
      payloadJson: "{}",
      preview: "John Forman",
      actionName: "Archive",
      sourceName: "Contact",
      state: "read",
      submissionId: "submission-1",
      tags: [],
      trashedAt: null,
    });

    render(<InboxItemScreen itemId="inbox-1" />);

    await user.click(
      await screen.findByRole("button", { name: "Inbox item actions" }),
    );
    expect(screen.getByRole("menuitem", { name: "Mark as unread" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Archive", hidden: true })).toBeInTheDocument();
  });

  test("offers moving an archived item back to the Inbox", async () => {
    getInboxItem.mockResolvedValue({ id: "inbox-1", createdAt: "2026-08-19T18:00:00Z", sourceName: "Contact", actionName: "Inbox", payloadJson: "{}", state: "archived", trashedAt: null, tags: [] });
    updateInboxItem.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InboxItemScreen itemId="inbox-1" />);
    await user.click(await screen.findByRole("button", { name: "Move to Inbox", hidden: true }));
    expect(updateInboxItem).toHaveBeenCalledWith("inbox-1", "unarchive");
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  test("uses a stable title instead of payload preview and links its Submission", async () => {
    getInboxItem.mockResolvedValue({ id: "inbox-1", createdAt: "2026-08-19T18:00:00Z", sourceName: "Contact", actionName: "Archive", payloadJson: "{}", preview: "Ada Lovelace · ada@example.test", state: "read", submissionId: "submission-1", trashedAt: null, tags: [] });
    render(<InboxItemScreen itemId="inbox-1" />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Inbox item" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    const header = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(header).toHaveTextContent("Contact");
    expect(header).toHaveTextContent("Received");
    expect(header).toHaveTextContent("ID: inbox-1");
    expect(within(header).queryByText("Read")).not.toBeInTheDocument();
    expect(within(header).queryByText("Action: Archive")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Inbox item actions" }));
    expect(await screen.findByRole("menuitem", { name: "Open Submission" })).toHaveAttribute("href", expect.stringContaining("/app/submissions/submission-1"));
    await waitFor(() => expect(document.title).toBe("Contact · Inbox item · Forman"));
  });

  test("keeps trashed unread items unchanged and offers restore", async () => {
    getInboxItem.mockResolvedValue({ id: "inbox-1", createdAt: "2026-08-19T18:00:00Z", sourceName: "Contact", actionName: "Inbox", payloadJson: "{}", state: "unread", trashedAt: "2026-08-20T00:00:00Z", tags: [] });
    render(<InboxItemScreen itemId="inbox-1" />);
    expect(await screen.findByRole("button", {name: "Restore"})).toBeVisible();
    expect(updateInboxItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "Archive"})).not.toBeInTheDocument();
  });

  test("moves the detail to Trash and returns to the original filtered page", async () => {
    getInboxItem.mockResolvedValue({id: "inbox-1", createdAt: "2026-08-19T18:00:00Z", sourceName: "Contact", actionName: "Inbox", payloadJson: "{}", state: "read", trashedAt: null, tags: []});
    updateInboxItem.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InboxItemScreen itemId="inbox-1" returnTo="/app/inbox?state=unread&page=2" />);
    await user.click(await screen.findByRole("button", {name: "Move to Trash"}));
    expect(updateInboxItem).toHaveBeenCalledWith("inbox-1", "trash");
    expect(navigationGo).toHaveBeenCalledWith("/app/inbox?state=unread&page=2");
  });

  test("marks an unread Inbox item as read after opening its detail", async () => {
    const unreadItem = {
      createdAt: "2026-08-19T18:00:00.000Z",
      sourceId: "internal-form-id",
      sourcePublicId: "contact-public",
      id: "inbox-1",
      payloadJson: "{}",
      preview: "John Forman",
      actionName: "Archive",
      sourceName: "Contact",
      state: "unread" as const,
      submissionId: "submission-1",
      tags: [],
      trashedAt: null,
    };
    getInboxItem.mockResolvedValueOnce(unreadItem).mockResolvedValueOnce({
      ...unreadItem,
      state: "read",
    });
    updateInboxItem.mockResolvedValue(undefined);

    render(<InboxItemScreen itemId="inbox-1" />);


    await waitFor(() =>
      expect(updateInboxItem).toHaveBeenCalledWith("inbox-1", "read"),
    );

  });

  test("opens its source Source through the public Source ID", async () => {
    getInboxItem.mockResolvedValue({
      createdAt: "2026-08-19T18:00:00.000Z",
      sourceId: "internal-form-id",
      sourcePublicId: "contact-public",
      id: "inbox-1",
      payloadJson: "{}",
      preview: "John Forman",
      actionName: "Archive",
      sourceName: "Contact",
      state: "unread",
      submissionId: "submission-1",
      tags: [],
      trashedAt: null,
    });

    render(<InboxItemScreen itemId="inbox-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Inbox item actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Open Source" }),
    ).toHaveAttribute("href", "/app/sources/contact-public");
  });

  test("formats Inbox data as readable values instead of raw JSON", async () => {
    getInboxItem.mockResolvedValue({
      createdAt: "2026-08-19T18:00:00.000Z",
      sourceId: "internal-form-id",
      sourcePublicId: "contact-public",
      id: "inbox-1",
      payloadJson: JSON.stringify({
        date: "2026-08-19T18:13:02.452Z",
        meta: {
          client: { ip: "10.89.0.16" },
          source: "browser",
          submissionId: "submission-1",
        },
        payload: {
          email: "john.forman@example.com",
          name: "John Forman",
          note: "Lorem ipsum.",
          optional: null,
          subscribed: true,
        },
      }),
      preview: "John Forman",
      actionName: "Archive",
      sourceName: "Contact",
      state: "unread",
      submissionId: "submission-1",
      tags: [],
      trashedAt: null,
    });

    const { container } = render(<InboxItemScreen itemId="inbox-1" />);

    const dataSection = (
      await screen.findByRole("heading", { name: "Data" })
    ).closest("section");
    expect(dataSection).not.toBeNull();
    expect(within(dataSection!).getByText("Email")).toBeInTheDocument();
    expect(
      within(dataSection!).getByText("john.forman@example.com"),
    ).toBeInTheDocument();
    expect(within(dataSection!).getByText("Subscribed")).toBeInTheDocument();
    expect(within(dataSection!).getByText("Yes")).toBeInTheDocument();
    expect(within(dataSection!).getByText("Optional")).toBeInTheDocument();
    expect(within(dataSection!).getByText("—")).toBeInTheDocument();

    const details = screen.getByRole("button", { name: "Technical details" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(details);
    const metadataSection = document.getElementById(details.getAttribute("aria-controls")!);
    expect(metadataSection).not.toBeNull();
    expect(within(metadataSection!).getAllByText("Source")).toHaveLength(1);
    expect(
      within(metadataSection!).queryByText("Action"),
    ).not.toBeInTheDocument();
    expect(within(metadataSection!).queryByText("State")).not.toBeInTheDocument();
    expect(within(metadataSection!).queryByText("Tags")).not.toBeInTheDocument();
    expect(within(metadataSection!).getByText("Client IP")).toBeInTheDocument();
    expect(
      within(metadataSection!).getByText("10.89.0.16"),
    ).toBeInTheDocument();
    expect(within(metadataSection!).getByText("browser")).toBeInTheDocument();
    expect(
      within(metadataSection!).getByText("Submission ID"),
    ).toBeInTheDocument();
    expect(
      within(metadataSection!).queryByText("Technical details"),
    ).not.toBeInTheDocument();
    expect(
      within(metadataSection!).queryByText("Date"),
    ).not.toBeInTheDocument();
    expect(
      within(metadataSection!).queryByText("Source ID"),
    ).not.toBeInTheDocument();

    expect(container.querySelector("pre")).not.toBeInTheDocument();
    expect(container.querySelector("code")).not.toBeInTheDocument();
  });
});

test("archived detail does not offer a read-state change",async()=>{getInboxItem.mockResolvedValue({id:"archived-audit",createdAt:"2026-01-01T00:00:00Z",sourceName:"Contact",sourcePublicId:"public",actionName:"Inbox",payloadJson:"{}",state:"archived",trashedAt:null,tags:[]});render(<InboxItemScreen itemId="archived-audit" />);await userEvent.click(await screen.findByRole("button",{name:"Inbox item actions"}));expect(screen.queryByRole("menuitem",{name:/Mark.*unread/})).not.toBeInTheDocument();cleanup();});
