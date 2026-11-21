import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { deletePage } from "@/client/admin-api/pages";
vi.mock("@/client/admin-api/pages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client/admin-api/pages")>()),
  deletePage: vi.fn(),
}));

import type { AdminPageSummary } from "@/shared/contracts/admin";

vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({
    children,
    href,
    ...properties
  }: {
    children: React.ReactNode;
    href: string;
  } & Omit<React.ComponentProps<"a">, "children" | "href">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go: vi.fn(), refresh: vi.fn() }),
}));

import { PagesScreen } from "@/components/pages/pages-screen";

const pages: AdminPageSummary[] = [
  {
    createdAt: "2026-08-21T08:00:00.000Z",
    enabled: true,
    sourceId: "form-1",
    sourceName: "Contact",
    sourcePublicId: "contact",
    id: "page-1",
    name: "Contact Prague",
    pageId: "contact-prague",
    publicUrl: "https://forman.test/pages/contact-prague",
    tags: [{ color: "blue", id: "sales", name: "Sales" }],
    updatedAt: "2026-08-21T09:00:00.000Z",
  },
];

describe("PagesScreen", () => {
  afterEach(cleanup);

  test("distinguishes search-only empty results and restores records on clear", async () => {
    render(<PagesScreen loadPages={async () => pages} loadTags={async () => []} />);
    await screen.findByRole("table", { name: "Built-in Forms" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "no-match" } });
    expect(await screen.findByText("No Built-in Forms match these filters")).toBeVisible();
    expect(screen.queryByText("No Built-in Forms yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("table", { name: "Built-in Forms" })).toBeVisible();
  });

  test("shows Pages as an independent publishing collection", async () => {
    const user = userEvent.setup();
    render(
      <PagesScreen
        loadPages={async () => pages}
        loadTags={async () => pages[0].tags}
      />,
    );

    const table = await screen.findByRole("table", { name: "Built-in Forms" });
    expect(table).toBeVisible();
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
        .filter(Boolean),
    ).toEqual(["Built-in Form", "Source", "Updated", "Status", "Tags", "Actions"]);
    expect(
      screen.queryByRole("columnheader", { name: "Page ID" }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Built-in Forms" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Built-in Form" })).toBeVisible();
    expect(within(table).getByText("Contact Prague")).toBeVisible();
    expect(within(table).queryAllByRole("link")).toHaveLength(0);
    expect(within(table).queryByRole("link", {name:"Contact"})).not.toBeInTheDocument();
    expect(screen.getAllByText("Sales")[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "Sales" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(
      within(table).getByRole("button", {
        name: "Actions for Built-in Form Contact Prague",
      }),
    );
    expect(
      screen.queryByRole("menuitem", { name: "Open Page details" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", {name:"Open Source"})).toHaveAttribute("href", "/app/sources/contact");
    expect(
      screen.getByRole("menuitem", { name: "Preview form" }),
    ).toHaveAttribute("href", "/app/preview/contact-prague");
    expect(
      screen.getByRole("menuitem", { name: "Preview form" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("menuitem", { name: "Preview form" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("menuitem", { name: "Delete permanently" })).toBeVisible();
  });

  test("explains the Source prerequisite when no Pages exist", async () => {
    render(<PagesScreen loadPages={async () => []} />);

    expect(await screen.findByText("No Built-in Forms yet")).toBeVisible();
    expect(
      screen.getByText("Create a Built-in Form from an existing Source."),
    ).toBeVisible();
  });

  test("keeps Pages that match any selected inherited Source tag", async () => {
    const user = userEvent.setup();
    render(
      <PagesScreen
        loadPages={async () => [
          ...pages,
          {
            ...pages[0],
            id: "page-2",
            name: "Support page",
            pageId: "support",
            tags: [{ color: "violet", id: "support", name: "Support" }],
          },
        ]}
        loadTags={async () => [
          { color: "blue", id: "sales", name: "Sales" },
          { color: "violet", id: "support", name: "Support" },
        ]}
      />,
    );

    await screen.findByRole("table", { name: "Built-in Forms" });
    expect(
      screen.getByRole("button", { name: "Clear tag filters" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Support" }));

    expect(screen.getAllByText("Support page").length).toBeGreaterThan(0);
    expect(screen.queryByText("Contact Prague")).not.toBeInTheDocument();
    const clearTagFilters = screen.getByRole("button", {
      name: "Clear tag filters",
    });
    expect(clearTagFilters).toBeEnabled();
    await user.click(clearTagFilters);
    expect(screen.getAllByText("Contact Prague").length).toBeGreaterThan(0);
  });

  test("replaces the table with an empty state when no Page matches selected tags", async () => {
    const user = userEvent.setup();
    render(
      <PagesScreen
        loadPages={async () => pages}
        loadTags={async () => [
          { color: "blue", id: "sales", name: "Sales" },
          { color: "violet", id: "support", name: "Support" },
        ]}
      />,
    );

    await screen.findByRole("table", { name: "Built-in Forms" });
    await user.click(screen.getByRole("button", { name: "Support" }));

    expect(
      screen.getByText("No Built-in Forms match these filters"),
    ).toBeVisible();
    expect(
      screen.queryByRole("table", { name: "Built-in Forms" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rows per page")).not.toBeInTheDocument();
  });
});

test("keeps the delete dialog actionable after a failed request", async () => {
  const user = userEvent.setup();
  vi.mocked(deletePage).mockRejectedValueOnce(new Error("offline"));
  render(
    <PagesScreen loadPages={async () => pages} loadTags={async () => []} />,
  );
  const table = await screen.findByRole("table", { name: "Built-in Forms" });
  await user.click(
    within(table).getByRole("button", {
      name: "Actions for Built-in Form Contact Prague",
    }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Delete permanently" }));
  await user.click(screen.getByRole("button", { name: "Delete permanently" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The Built-in Form could not be deleted. Try again.",
  );
  expect(deletePage).toHaveBeenCalledWith("contact-prague");
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    within(table).getByText("Contact Prague"),
  ).toBeVisible();
  cleanup();
});
