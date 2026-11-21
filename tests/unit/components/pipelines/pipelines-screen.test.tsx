import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PipelinesScreen } from "@/components/pipelines/pipelines-screen";

vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>{children}</a>
  ),
  useAppNavigation: () => ({ go: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/pipelines",
  useSearchParams: () => new URLSearchParams(),
}));

describe("PipelinesScreen", () => {
  afterEach(cleanup);

  test("distinguishes search-only empty results and restores records on clear", async () => {
    render(<PipelinesScreen loadPipelines={async () => [{enabled:true,id:"flow",name:"Contact pipeline",sourceId:"source",sourcePublicId:"public",sourceName:"Contact",steps:[],tags:[]}]} loadTags={async () => []} />);
    await screen.findByRole("table", { name: "Pipelines" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "no-match" } });
    expect(await screen.findByText("No Pipelines match these filters")).toBeVisible();
    expect(screen.queryByText("No Pipelines yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("table", { name: "Pipelines" })).toBeVisible();
  });

  test("opens the full-page Pipeline editor from the collection and empty state", async () => {
    render(<PipelinesScreen loadPipelines={async () => []} />);

    const emptyState = (await screen.findByText("No Pipelines yet")).closest("section");
    expect(emptyState).not.toBeNull();
    const emptySection = emptyState as HTMLElement;
    expect(emptySection).toHaveTextContent("No Pipelines yet");
    expect(
      within(emptySection).queryByRole("button", { name: "Create Pipeline" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create Pipeline" })).toHaveLength(1);
  });

  test("makes the Pipeline name the primary editor path and exposes Runs as a secondary action", async () => {
    render(
      <PipelinesScreen
        loadPipelines={async () => [
          {
            enabled: true,
            id: "flow-1",
            name: "Verify contact",
            sourceId: "source-1",
            sourcePublicId: "public-source",
            sourceName: "Contact",
            steps: [],
            tags: [],
          },
        ]}
      />,
    );

    expect((await screen.findAllByText("Verify contact"))[0]).toBeVisible();
    const actionMenus = screen.getAllByRole("button", { name: "Actions for Verify contact" });
    expect(actionMenus).toHaveLength(1);
    expect(screen.queryAllByRole("link", {name:"Contact"})).toHaveLength(0);
    fireEvent.click(actionMenus[0]);
    expect(screen.getByRole("menuitem", {name:"Open Source"})).toHaveAttribute("href", "/app/sources/public-source");
    expect(screen.getByRole("menuitem", {name:"Open Pipeline"})).toHaveAttribute("href", "/app/pipelines/flow-1");
    expect(screen.getByRole("menuitem", {name:"View Actions"})).toHaveAttribute("href", "/app/pipelines/flow-1#actions");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "",
      "Pipeline",
      "Source",
      "Actions",
      "Status",
      "Tags",
      "Options",
    ]);
    expect(screen.getByRole("group", { name: "Top table controls" })).toBeVisible();
  });

  test("filters Pipelines by tags inherited from their Data Source", async () => {
    render(
      <PipelinesScreen
        loadPipelines={async () => [
          { enabled: true, id: "flow-1", name: "Verify contact", sourceId: "source-1", sourcePublicId: "public-source-1", sourceName: "Contact", steps: [], tags: [{ color: "blue", id: "tag-sales", name: "Sales" }] },
          { enabled: true, id: "flow-2", name: "Archive contact", sourceId: "source-2", sourcePublicId: "public-source-2", sourceName: "Archive", steps: [], tags: [{ color: "rose", id: "tag-support", name: "Support" }] },
        ]}
      />,
    );

    const sales = await screen.findByRole("button", { name: "Sales" });
    expect(screen.getAllByText("Verify contact")).toHaveLength(1);
    fireEvent.click(sales);
    expect(screen.queryAllByText("Archive contact")).toHaveLength(0);
  });
});

 test("honors Source links and exposes a removable Source filter", async () => {
 render(<PipelinesScreen initialQuery={{sourceId: "source-1"}} loadPipelines={async () => [
 {enabled:true,id:"one",name:"Matching pipeline",sourceId:"source-1",sourcePublicId:"public-1",sourceName:"Contact",steps:[],tags:[]},
 {enabled:true,id:"two",name:"Other pipeline",sourceId:"source-2",sourcePublicId:"public-2",sourceName:"Other",steps:[],tags:[]}
 ]} />);
 await screen.findAllByText("Matching pipeline");
 expect(screen.queryAllByText("Other pipeline")).toHaveLength(0);
 expect(screen.getByRole("button", {name:"Remove filter Source: Contact"})).toBeInTheDocument();
 });

test("shows catalog tags even when no Pipeline has them and can clear an empty result", async () => {
  render(<PipelinesScreen
    loadTags={async () => [{ id: "unused", name: "Unused", color: "blue" }]}
    loadPipelines={async () => [{
      id: "flow", name: "Untagged Pipeline", enabled: true,
      sourceId: "source", sourcePublicId: "public", sourceName: "Source",
      steps: [], tags: [],
    }]}
  />);
  const tag = await screen.findByRole("button", { name: "Unused" });
  await screen.findAllByText("Untagged Pipeline");
  fireEvent.click(tag);
  expect(screen.queryAllByText("Untagged Pipeline")).toHaveLength(0);
  expect(screen.getByText("No Pipelines match these filters")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear tag filters" }));
  expect(screen.getAllByText("Untagged Pipeline")).toHaveLength(1);
});
