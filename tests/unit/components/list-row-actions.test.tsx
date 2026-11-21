import { PipelineRowActions } from "@/components/pipelines/pipeline-row-actions";
import { act } from "@testing-library/react";
import { SourcesList } from "@/components/sources/sources-list";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { Menu } from "@mantine/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PipelinesScreen } from "@/components/pipelines/pipelines-screen";
import { PagesList } from "@/components/pages/pages-list";
import { SubmissionRowActions } from "@/components/submissions/submission-row-actions";
import { InboxRecords } from "@/components/inbox/inbox-records";
const {
  updatePipelineConfiguration,
  deletePipeline,
  setPagePublished,
  deletePage,
} = vi.hoisted(() => ({
  updatePipelineConfiguration: vi.fn().mockResolvedValue({}),
  deletePipeline: vi.fn().mockResolvedValue(undefined),
  setPagePublished: vi.fn().mockResolvedValue({}),
  deletePage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/client/admin-api/pipelines", async (original) => ({
  ...(await original()),
  updatePipelineConfiguration,
  deletePipeline,
}));
vi.mock("@/client/admin-api/pages", async (original) => ({
  ...(await original()),
  setPagePublished,
  deletePage,
}));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
test("Pipeline menu can disable without resending Actions and explains deletion constraints", async () => {
  render(
    <PipelinesScreen
      loadPipelines={async () => [
        {
          id: "pipeline",
          name: "Notify",
          enabled: true,
          sourceId: "internal",
          sourcePublicId: "public",
          sourceName: "Contact",
          steps: [],
          tags: [],
        },
      ]}
    />,
  );
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Actions for Notify" }))[0],
  );
  expect(
    screen.getByRole("menuitem", { name: "Delete permanently" }),
  ).toHaveAttribute("data-disabled", "true");
  fireEvent.click(screen.getByRole("menuitem", { name: "Disable" }));
  await waitFor(() =>
    expect(updatePipelineConfiguration).toHaveBeenCalledWith("pipeline", {
      enabled: false,
    }),
  );
});
test("Form menu publishes through a state-only mutation and keeps preview available", async () => {
  render(
    <PagesList
      tags={[]}
      onDeleted={vi.fn()}
      pages={[
        {
          id: "id",
          pageId: "public-form",
          name: "Contact form",
          enabled: false,
          sourceId: "internal",
          sourcePublicId: "public",
          sourceName: "Contact",
          publicUrl: "https://example.test/p/public-form",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
          tags: [],
        },
      ]}
    />,
  );
  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Actions for Built-in Form Contact form",
    })[0],
  );
  expect(
    screen.getByRole("menuitem", { name: "Preview form" }),
  ).toHaveAttribute("target", "_blank");
  fireEvent.click(screen.getByRole("menuitem", { name: "Publish" }));
  await waitFor(() =>
    expect(setPagePublished).toHaveBeenCalledWith("public-form", true),
  );
});
test("Inbox row offers state-appropriate actions and keeps Source navigation independent", () => {
  const move = vi.fn();
  const open = vi.fn();
  render(
    <InboxRecords
      items={[
        {
          id: "item",
          actionName: "Review",
          createdAt: "2026-01-01",
          preview: "Hello",
          submissionId:"submission",
          sourceId: "internal",
          sourcePublicId: "public",
          sourceName: "Contact",
          state: "unread",
          trashedAt: null,
          tags: [],
        },
      ]}
      selected={[]}
      pending={false}
      trash={false}
      detailPath={(id) => "/app/inbox/" + id + "?returnTo=" + encodeURIComponent("/app/inbox?sourceId=internal&state=unread&page=2")}
      onOpen={open}
      onSelectionChange={vi.fn()}
      onAction={move}
    />,
  );
  const table = screen.getByRole("table");
  expect(
    within(table).queryByRole("link", { name: "Contact" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(table).getByRole("button", { name: "Actions for Hello" }),
  );
  expect(screen.getByRole("menuitem", { name: "Open Source" })).toHaveAttribute(
    "href",
    "/app/sources/public",
  );
  expect(
    screen.getByRole("menuitem", { name: "Open Inbox item" }),
  ).toHaveAttribute("href", "/app/inbox/item?returnTo="+encodeURIComponent("/app/inbox?sourceId=internal&state=unread&page=2"));
  expect(screen.getByRole("menuitem",{name:"Open Submission"})).toHaveAttribute("href","/app/submissions/submission?returnTo="+encodeURIComponent("/app/inbox?sourceId=internal&state=unread&page=2"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Mark as read" }));
  expect(move).toHaveBeenCalledWith("item", "read");
  expect(open).not.toHaveBeenCalled();
});

test("Submission deletion waits for confirmation and reports failure without closing", async () => {
  const request = vi
    .spyOn(await import("@/client/admin-api/submissions"), "deleteSubmission")
    .mockRejectedValue(new Error("offline"));
  render(
    <SubmissionRowActions
      submission={{
        id: "one",
        sourceId: "internal",
        sourcePublicId: "public",
        sourceName: "Contact",
        createdAt: "2026-01-01",
        payload: {},
        referer: null,
        userAgent: null,
        tags: [],
      }}
      onDeleted={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Actions for Submission one" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete permanently" }));
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await screen.findByText("The Submission could not be deleted. Try again.");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  request.mockRestore();
});

test("restores a stable collection focus target when an operated row disappears", async () => {
  const view = render(
    <main>
      <h1>Sources</h1>
      <RowActionsMenu label="Actions for removed">
        <Menu.Item>Remove</Menu.Item>
      </RowActionsMenu>
    </main>,
  );
  screen.getByRole("button", { name: "Actions for removed" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Actions for removed" }));
  view.rerender(
    <main>
      <h1>Sources</h1>
    </main>,
  );
  await waitFor(() => expect(screen.getByRole("heading")).toHaveFocus());
});

test("Source menu exposes its detail and related collections using the correct IDs", () => {
  render(
    <SourcesList
      sources={[
        {
          id: "internal",
          sourceId: "public",
          name: "Contact",
          type: "one-shot",
          enabled: true,
          pipelineCount: 2, pageCount: 1,
          fieldDefinitionMode: "json-schema",
          fieldDefinitionSource: "{}",
          totalSubmissionCount: 9,
          submissionsLast24Hours: 1,
          submissionsLast7Days: 3,
          submissionsLast30Days: 5,
          lastSubmission: { id: "latest", createdAt: "2026-01-01" },
          tags: [],
        },
      ]}
    />,
  );
  const table = screen.getByRole("table");
  expect(within(table).queryAllByRole("link")).toHaveLength(0);
  fireEvent.click(
    within(table).getByRole("button", { name: "Actions for Contact" }),
  );
  for (const [name, href] of [
    ["Open Source", "/app/sources/public"],
    ["View Pipelines", "/app/pipelines?sourceId=internal"],
    ["View Submissions", "/app/submissions?sourceId=internal"],
    ["View Built-in Forms", "/app/pages?sourceId=internal"],
    ["Create Pipeline", "/app/pipelines?create=1&sourceId=internal"],
    ["Create Built-in Form", "/app/pages?create=1&sourceId=internal"],
  ]) {
    expect(screen.getByRole("menuitem", { name })).toHaveAttribute(
      "href",
      href,
    );
  }
});

test("Source menu hides absent relations and explains unavailable creation", () => {
  render(<SourcesList sources={[{
    id: "internal", sourceId: "public", name: "Machine", type: "m2m", enabled: false,
    pipelineCount: 0, pageCount: 0, totalSubmissionCount: 0,
    submissionsLast24Hours: 0, submissionsLast7Days: 0, submissionsLast30Days: 0,
    lastSubmission: null,
  }]} />);
  fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Actions for Machine" }));
  for (const name of ["View Pipelines", "View Built-in Forms", "View Inbox", "View Pipeline Runs", "View Waiting Callbacks"])
    expect(screen.queryByRole("menuitem", { name })).not.toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Create Pipeline" })).toHaveAttribute("data-disabled");
  expect(screen.getByRole("menuitem", { name: "Create Built-in Form" })).toHaveAttribute("data-disabled");
  expect(screen.getByText("Activate the Source first.")).toBeInTheDocument();
  expect(screen.getByText("Built-in Forms require a One-shot or Session Source.")).toBeInTheDocument();
});

test("Forms reached from a Source keep its filter through paging and allow removing it", () => {
  const change = vi.fn();
  const makePage = (id: string, sourceId: string) => ({
    id,
    pageId: id,
    name: id,
    sourceId,
    sourcePublicId: "public-" + sourceId,
    sourceName: sourceId,
    enabled: true,
    tags: [],
    publicUrl: "https://example.test/" + id,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  render(
    <PagesList
      initialQuery={{ sourceId: "chosen" }}
      onQueryChange={change}
      onDeleted={vi.fn()}
      pages={[
        ...Array.from({ length: 11 }, (_, i) =>
          makePage("form-" + i, "chosen"),
        ),
        makePage("unrelated", "other"),
      ]}
      tags={[]}
    />,
  );
  expect(
    screen.queryByText("unrelated"),
  ).not.toBeInTheDocument();
  const nextButtons = screen.getAllByRole("button", { name: "Next page" });
  expect(nextButtons).toHaveLength(2);
  fireEvent.click(nextButtons[0]);
  expect(change).toHaveBeenLastCalledWith({
    search: "",
    page: "2",
    size: "10",
    tagId: [],
    sourceId: "chosen",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Remove filter Source: chosen" }),
  );
  expect(change).toHaveBeenLastCalledWith({
    search: "",
    page: "1",
    size: "10",
    tagId: [],
    sourceId: undefined,
  });
});

test("published Form with inactive Source cannot open public form",()=>{render(<PagesList tags={[]} onDeleted={vi.fn()} pages={[{id:"id",pageId:"public-form",name:"Unavailable",enabled:true,sourceEnabled:false,sourceId:"internal",sourcePublicId:"public",sourceName:"Contact",publicUrl:"https://example.test/pages/public-form",createdAt:"2026-01-01",updatedAt:"2026-01-01",tags:[]}]} />);fireEvent.click(screen.getAllByRole("button",{name:"Actions for Built-in Form Unavailable"})[0]);expect(screen.getByRole("menuitem",{name:"Open public form"})).toHaveAttribute("data-disabled","true");});

test("late Pipeline deletion does not navigate after its menu unmounts", async () => {
  let resolve!: () => void;
  deletePipeline.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
  const onDeleted = vi.fn();
  const onChanged = vi.fn();
  const view = render(<PipelineRowActions detail pipeline={{id:"pipeline",name:"Notify",enabled:false,sourceId:"internal",sourcePublicId:"public",sourceName:"Contact",steps:[],tags:[]}} onChanged={onChanged} onDeleted={onDeleted} />);
  fireEvent.click(screen.getByRole("button", { name: "Pipeline actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete permanently" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(deletePipeline).toHaveBeenCalledWith("pipeline"));
  view.unmount();
  await act(async () => { resolve(); });
  expect(onDeleted).not.toHaveBeenCalled();
  expect(onChanged).not.toHaveBeenCalled();
});
