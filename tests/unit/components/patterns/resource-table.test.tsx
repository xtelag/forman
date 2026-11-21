import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ResourceTable } from "@/components/patterns/resource-table";

const sources = [{ enabled: true, sourceId: "contact-form", name: "Contact" }];

describe("ResourceTable", () => {
  afterEach(cleanup);

  test("uses tabular numerals for data on wide and narrow screens", () => {
    const { container } = render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          { id: "name", label: "Name", render: (source) => source.name },
        ]}
        getRowKey={(source) => source.sourceId}
        items={sources}
      />,
    );
    expect(container.querySelector('[data-slot="resource-table"]')).toHaveStyle(
      { fontVariantNumeric: "tabular-nums" },
    );
  });

  test("uses shared semantic column widths without stretching content", () => {
    render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          { id: "name", label: "Name", render: (source) => source.name },
          {
            id: "status",
            label: "Status",
            render: (source) => (source.enabled ? "Active" : "Inactive"),
            sizing: "compact",
          },
          {
            id: "actions",
            label: "Actions",
            render: () => "Menu",
            sizing: "action",
          },
        ]}
        getRowKey={(source) => source.sourceId}
        items={sources}
      />,
    );

    const table = screen.getByRole("table", { name: "Sources" });
    const nameHeader = within(table).getByRole("columnheader", {
      name: "Name",
    });
    const statusHeader = within(table).getByRole("columnheader", {
      name: "Status",
    });
    const actionsHeader = within(table).getByRole("columnheader", {
      name: "Actions",
    });
    expect(nameHeader.style.width).toBe("");
    expect(statusHeader.style.width).not.toBe("");
    expect(actionsHeader.style.width).not.toBe("");
  });

  test("keeps row actions independent from opening a record", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          { id: "name", label: "Name", render: (source) => source.name },
          {
            id: "actions",
            label: "Actions",
            render: () => <button type="button">Menu</button>,
          },
        ]}
        getRowKey={(source) => source.sourceId}
        items={sources}
        onRowClick={onRowClick}
      />,
    );
    const table = screen.getByRole("table", { name: "Sources" });
    await user.click(within(table).getByRole("button", { name: "Menu" }));
    expect(onRowClick).not.toHaveBeenCalled();
    await user.click(within(table).getByText("Contact"));
    expect(onRowClick).toHaveBeenCalledWith(sources[0]);
  });

  test("keeps a semantic table on wide screens", () => {
    const onSort = vi.fn();
    render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          {
            id: "name",
            label: "Name",
            render: (form) => form.name,
            sort: { direction: "ascending", onSort },
          },
          {
            id: "status",
            label: "Status",
            render: (form) => (form.enabled ? "Active" : "Inactive"),
          },
        ]}
        getRowKey={(form) => form.sourceId}
        items={sources}
      />,
    );

    expect(screen.getByRole("table", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /name/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(
      screen.getByRole("button", { name: "Sort by Name" }),
    ).toBeInTheDocument();
  });

  test("delegates sorting to the consumer through the desktop header control", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          {
            id: "name",
            label: "Name",
            render: (form) => form.name,
            sort: { direction: "none", onSort },
          },
        ]}
        getRowKey={(form) => form.sourceId}
        items={sources}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));

    expect(onSort).toHaveBeenCalledOnce();
  });

  test("uses the same labeled fields for each narrow-screen row", () => {
    const { container } = render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          { id: "name", label: "Name", render: (form) => form.name },
          {
            id: "status",
            label: "Status",
            render: (form) => (form.enabled ? "Active" : "Inactive"),
          },
        ]}
        getRowKey={(form) => form.sourceId}
        items={sources}
      />,
    );

    const mobileRows = container.querySelectorAll(
      '[data-slot="resource-table-mobile-row"]',
    );
    const mobileRow = mobileRows.item(0);
    expect(mobileRow).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="resource-table-mobile-list"]'),
    ).toHaveAttribute("aria-label", "Sources");
    expect(
      within(mobileRow as HTMLElement).getByText("Name"),
    ).toBeInTheDocument();
    expect(
      within(mobileRow as HTMLElement).getByText("Contact"),
    ).toBeInTheDocument();
    expect(
      within(mobileRow as HTMLElement).getByText("Status"),
    ).toBeInTheDocument();
    expect(
      within(mobileRow as HTMLElement).getByText("Active"),
    ).toBeInTheDocument();
    expect(
      mobileRow?.querySelector('[data-slot="card"]'),
    ).not.toBeInTheDocument();
  });

  test("keeps narrow-row fields isolated and does not repeat sort controls", () => {
    const { container } = render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          {
            id: "name",
            label: "Name",
            render: (form) => form.name,
            sort: { direction: "none", onSort: vi.fn() },
          },
          {
            id: "status",
            label: "Status",
            render: (form) => (form.enabled ? "Active" : "Inactive"),
          },
        ]}
        getRowKey={(form) => form.sourceId}
        items={[
          ...sources,
          { enabled: false, sourceId: "survey-form", name: "Survey" },
        ]}
      />,
    );

    const [contactRow, surveyRow] = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-slot="resource-table-mobile-row"]',
      ),
    );
    expect(within(contactRow).getByText("Contact")).toBeInTheDocument();
    expect(within(contactRow).queryByText("Survey")).not.toBeInTheDocument();
    expect(within(surveyRow).getByText("Survey")).toBeInTheDocument();
    expect(within(surveyRow).getByText("Inactive")).toBeInTheDocument();
    expect(
      within(
        container.querySelector(
          '[data-slot="resource-table-mobile-list"]',
        ) as HTMLElement,
      ).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  test("exposes a mobile row action without a redundant Actions field", () => {
    const { container } = render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          { id: "name", label: "Name", render: (source) => source.name },
          {
            id: "actions",
            label: "Actions",
            mobileAction: true,
            render: () => <button type="button">Open actions</button>,
          },
        ]}
        getRowKey={(source) => source.sourceId}
        items={sources}
      />,
    );
    const row = container.querySelector<HTMLElement>(
      '[data-slot="resource-table-mobile-row"]',
    )!;
    expect(
      within(row).getByRole("button", { name: "Open actions" }),
    ).toBeInTheDocument();
    expect(within(row).queryByText("Actions")).not.toBeInTheDocument();
  });

  test("provides matching selection controls for table and mobile rows", async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const onSelectedChange = vi.fn();
    render(
      <ResourceTable
        ariaLabel="Submissions"
        columns={[{ id: "name", label: "Name", render: (form) => form.name }]}
        getRowKey={(form) => form.sourceId}
        items={sources}
        selection={{
          allSelected: false,
          isSelected: () => false,
          onSelectAll,
          onSelectedChange,
        }}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Select all submissions" }),
    );
    await user.click(
      screen.getAllByRole("checkbox", {
        name: "Select submission contact-form",
      })[0],
    );
    expect(onSelectAll).toHaveBeenCalledWith(true);
    expect(onSelectedChange).toHaveBeenCalledWith(sources[0], true);
    expect(
      screen.getAllByRole("checkbox", {
        name: "Select submission contact-form",
      }),
    ).toHaveLength(2);
  });

  test("keeps the trailing row actions pinned while a wide table scrolls", () => {
    render(
      <ResourceTable
        ariaLabel="Sources"
        columns={[
          { id: "name", label: "Name", render: (source) => source.name },
          {
            id: "actions",
            label: "Actions",
            render: () => "Menu",
            sizing: "action",
          },
        ]}
        getRowKey={(source) => source.sourceId}
        items={sources}
      />,
    );
    const table = screen.getByRole("table", { name: "Sources" });
    expect(
      within(table).getByRole("columnheader", { name: "Actions" }),
    ).toHaveAttribute("data-sticky-action", "true");
    expect(within(table).getByRole("cell", { name: "Menu" })).toHaveAttribute(
      "data-sticky-action",
      "true",
    );
    expect(
      within(table).getByRole("cell", { name: "Contact" }),
    ).not.toHaveAttribute("data-sticky-action");
  });
});

test("row convenience navigation ignores links, modifiers, selection, and selected card checkboxes",()=>{
 const open=vi.fn(), select=vi.fn();
 const {container}=render(<ResourceTable ariaLabel="Sources" items={sources} getRowKey={s=>s.sourceId} onRowClick={open} selection={{allSelected:true,isSelected:()=>true,onSelectAll:select,onSelectedChange:select}} columns={[{id:"name",label:"Source",render:s=><a href="#source">{s.name}</a>}]} />);
 const row=container.querySelector<HTMLElement>('[data-slot="resource-table-mobile-row"]')!;
 fireEvent.click(within(row).getByRole("checkbox"));expect(select).toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
 fireEvent.click(within(row).getByRole("link"));expect(open).not.toHaveBeenCalled();
 fireEvent.click(row,{ctrlKey:true});fireEvent.click(row,{metaKey:true});expect(open).not.toHaveBeenCalled();
 const selection=vi.spyOn(window,"getSelection").mockReturnValue({toString:()=>"selected text"} as Selection);
 fireEvent.click(row);expect(open).not.toHaveBeenCalled();selection.mockRestore();
 fireEvent.click(row);expect(open).toHaveBeenCalledOnce();
});

test("keyboard opens a focused record but never intercepts controls inside it", () => {
 const open=vi.fn();
 const {container,rerender}=render(<ResourceTable ariaLabel="Sources" items={sources} getRowKey={s=>s.sourceId} onRowClick={open} columns={[{id:"name",label:"Source",render:s=>s.name},{id:"actions",label:"Actions",mobileAction:true,render:()=> <button>Options</button>}]} />);
 for(const row of [container.querySelector("tbody tr")!,container.querySelector('[data-slot="resource-table-mobile-row"]')!]) {
   expect(row).toHaveAttribute("tabindex","0");
   fireEvent.keyDown(within(row as HTMLElement).getByRole("button"),{key:"Enter"});
   expect(open).not.toHaveBeenCalled();
   fireEvent.keyDown(row,{key:"Enter"});
   expect(open).toHaveBeenCalledWith(sources[0]);
   open.mockClear();
 }
 rerender(<ResourceTable ariaLabel="Sources" items={sources} getRowKey={s=>s.sourceId} columns={[{id:"name",label:"Source",render:s=>s.name}]} />);
 expect(container.querySelector("tbody tr")).not.toHaveAttribute("tabindex");
});
