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

const { deletePage, getPage, go } = vi.hoisted(() => ({
  deletePage: vi.fn(),
  getPage: vi.fn(),
  go: vi.fn(),
}));

vi.mock("@/client/admin-api/pages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client/admin-api/pages")>()),
  deletePage,
  getPage,
}));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go, refresh: vi.fn() }),
}));

import { PageDetailScreen } from "@/components/pages/page-detail-screen";

const page = {
  createdAt: "2026-08-21T08:00:00.000Z",
  enabled: false,
  sourceId: "form-1",
  sourceName: "Contact",
  sourcePublicId: "contact",
  id: "page-1",
  name: "Contact Prague",
  pageId: "contact-prague",
  presentation: null,
  fields: [
    {
      page: 1,
      valueType: "string",
      name: "name",
      label: "Name",
      htmlControl: "text",
      required: false,
    },
  ],
  publicUrl: "https://forman.test/pages/contact-prague",
  tags: [],
  updatedAt: "2026-08-21T08:00:00.000Z",
};

describe("PageDetailScreen", () => {
  test("keeps the populated Page draft visible with a retry warning until refresh recovery", async () => {
    const user = userEvent.setup();
    getPage
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ...page,
        name: "Server Page",
        updatedAt: "2026-09-05T12:00:00Z",
      });
    render(<PageDetailScreen pageId="contact-prague" />);
    expect(
      await screen.findByRole("tab", { name: /^Configuration$/ }),
    ).toHaveAttribute("aria-selected", "true");
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Draft Page" } });
    await act(async () => window.dispatchEvent(new Event("focus")));
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("Showing data from");
    expect(name).toHaveValue("Draft Page");
    await user.click(
      within(warning).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Couldn.t refresh this page/),
      ).not.toBeInTheDocument(),
    );
    expect(name).toHaveValue("Draft Page");
    await user.click(
      screen.getByRole("button", { name: "Reload and discard changes" }),
    );
    expect(name).toHaveValue("Server Page");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("shows Page identity and removes only the selected Page after confirmation", async () => {
    const user = userEvent.setup();
    getPage.mockResolvedValue(page);
    deletePage.mockResolvedValue(undefined);

    render(<PageDetailScreen pageId="contact-prague" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Contact Prague" }),
    ).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to all Built-in Forms" }),
    ).toHaveAttribute("href", "/app/pages");

    expect(
      screen.queryByRole("button", { name: "Delete permanently" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Built-in Form actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Preview form" }),
    ).toHaveAttribute("href", "/app/preview/contact-prague");
    expect(
      screen.getByRole("menuitem", { name: "Preview form" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("menuitem", { name: "Preview form" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    await user.click(screen.getByRole("menuitem", { name: "Delete permanently" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Built-in Form?" });
    expect(dialog).toHaveTextContent("The Source remains unchanged.");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );

    expect(deletePage).toHaveBeenCalledWith("contact-prague");
    expect(go).toHaveBeenCalledWith("/app/pages");
  });

  test("prevents a failed Page deletion from navigating away and supports a safe retry", async () => {
    const user = userEvent.setup();
    let rejectDelete: (reason: Error) => void = () => undefined;
    deletePage
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectDelete = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);
    getPage.mockResolvedValue(page);

    render(<PageDetailScreen pageId="contact-prague" />);

    await screen.findByRole("heading", { level: 1, name: "Contact Prague" });
    await user.click(screen.getByRole("button", { name: "Built-in Form actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete permanently" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Delete Built-in Form?" }),
      ).getByRole("button", {
        name: "Delete permanently",
      }),
    );

    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    await act(async () => rejectDelete(new Error("offline")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The Built-in Form could not be deleted. Try again.",
    );
    expect(go).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(deletePage).toHaveBeenCalledTimes(2);
    expect(go).toHaveBeenCalledWith("/app/pages");
  });

  test("explains why Preview form is unavailable when the linked Source has no Form fields", async () => {
    const user = userEvent.setup();
    getPage.mockResolvedValue({ ...page, fields: [] });

    render(<PageDetailScreen pageId="contact-prague" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Contact Prague" }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This Built-in Form needs Source fields before it can be previewed or published.",
    );
    expect(
      screen.getByRole("link", { name: "Configure Source fields" }),
    ).toHaveAttribute("href", "/app/sources/contact");

    await user.click(screen.getByRole("button", { name: "Built-in Form actions" }));
    expect(
      screen.queryByRole("link", { name: "Preview form" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Preview form" }),
    ).toHaveAttribute("data-disabled", "true");
  });

  test("ignores a late successful deletion after the screen unmounts", async () => {
    const user = userEvent.setup();
    let resolveDelete: () => void = () => undefined;
    deletePage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    getPage.mockResolvedValue(page);

    const { unmount } = render(<PageDetailScreen pageId="contact-prague" />);

    await screen.findByRole("heading", { level: 1, name: "Contact Prague" });
    await user.click(screen.getByRole("button", { name: "Built-in Form actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete permanently" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Delete Built-in Form?" }),
      ).getByRole("button", {
        name: "Delete permanently",
      }),
    );
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();

    unmount();
    await act(async () => resolveDelete());

    expect(go).not.toHaveBeenCalled();
  });

  test("ignores a stale deletion failure after the Page identity changes", async () => {
    const user = userEvent.setup();
    let rejectDelete: (reason: Error) => void = () => undefined;
    deletePage.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDelete = reject;
        }),
    );
    getPage.mockImplementation(async (pageId: string) => ({
      ...page,
      name: pageId === "other-page" ? "Other Page" : page.name,
      pageId,
    }));

    const { rerender } = render(<PageDetailScreen pageId="contact-prague" />);

    await screen.findByRole("heading", { level: 1, name: "Contact Prague" });
    await user.click(screen.getByRole("button", { name: "Built-in Form actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete permanently" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Delete Built-in Form?" }),
      ).getByRole("button", {
        name: "Delete permanently",
      }),
    );

    rerender(<PageDetailScreen pageId="other-page" />);
    await screen.findByText("ID: other-page");
    expect(
      screen.queryByRole("dialog", { name: "Delete Built-in Form?" }),
    ).not.toBeInTheDocument();
    await act(async () => rejectDelete(new Error("late failure")));

    expect(
      screen.queryByText("The Built-in Form could not be deleted. Try again."),
    ).not.toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });
});
