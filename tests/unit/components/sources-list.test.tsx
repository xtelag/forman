import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SourcesList } from "@/components/sources/sources-list";

const { deleteSource, setSourceEnabled } = vi.hoisted(() => ({
  deleteSource: vi.fn(),
  setSourceEnabled: vi.fn(),
}));
vi.mock("@/client/admin-api/sources", () => ({ deleteSource, setSourceEnabled }));

vi.mock("next/navigation", () => ({useRouter: () => ({push:vi.fn()}), usePathname: () => "/app/sources"}));

describe("SourcesList", () => {
  afterEach(cleanup);

  test("places Tags after lifecycle Status and before row actions", () => {
    render(
      <SourcesList
        sources={[
          {
            type: "one-shot" as const,
            pipelineCount: 0, pageCount: 0,
            enabled: true,
            sourceId: "contact-form",
            id: "1",
            lastSubmission: null,
            name: "Contact",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
          },
          {
            type: "one-shot" as const,
            pipelineCount: 0, pageCount: 0,
            enabled: false,
            sourceId: "survey-form",
            id: "2",
            lastSubmission: null,
            name: "Survey",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
          },
        ]}
      />,
    );

    const table = screen.getByRole("table", { name: "Sources" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim()),
    ).toEqual([
      "",
      "Source",
      "Type",
      "Pipelines",
      "Submissions",
      "Last Submission",
      "Status",
      "Tags",
      "Actions",
    ]);
    expect(within(table).getByText("Contact")).toBeVisible();
    expect(within(table).queryAllByRole("link")).toHaveLength(0);

    const activeStatus = within(table)
      .getAllByText("Active")[0]
      .closest("[data-status]");
    expect(activeStatus).toHaveAttribute("data-status", "active");

    expect(screen.getAllByText("Inactive")).not.toHaveLength(0);
  });

  test("groups each form's row actions in a kebab menu", async () => {
    const user = userEvent.setup();
    render(
      <SourcesList
        sources={[
          {
            type: "one-shot" as const,
            pipelineCount: 2, pageCount: 0,
            enabled: true,
            sourceId: "contact-form",
            id: "1",
            lastSubmission: {
              createdAt: "2026-08-23T10:00:00.000Z",
              id: "submission-1",
            },
            name: "Contact",
            submissionsLast30Days: 4, totalSubmissionCount: 4, submissionsLast24Hours: 0, submissionsLast7Days: 0,
          },
        ]}
      />,
    );

    await user.click(
      within(screen.getByRole("table", { name: "Sources" })).getByRole(
        "button",
        { name: "Actions for Contact" },
      ),
    );

    expect(
      screen.queryByRole("menuitem", { name: "Open Source details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "View Pipelines" }),
    ).toHaveAttribute("href", "/app/pipelines?sourceId=1");
    expect(
      screen.getByRole("menuitem", { name: "View Submissions" }),
    ).toHaveAttribute("href", "/app/submissions?sourceId=1");
    expect(screen.queryByRole("menuitem", { name: "Open latest Submission" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Deactivate" })).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Delete permanently" }),
    ).not.toBeInTheDocument();
  });

  test("confirms deactivation before the Source stops accepting submissions", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    setSourceEnabled.mockResolvedValue(undefined);
    render(
      <SourcesList
        onChanged={onChanged}
        sources={[
          {
            type: "one-shot" as const,
            pipelineCount: 0, pageCount: 0,
            enabled: true,
            sourceId: "contact-form",
            id: "1",
            lastSubmission: null,
            name: "Contact",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
          },
        ]}
      />,
    );

    await user.click(
      within(screen.getByRole("table", { name: "Sources" })).getByRole(
        "button",
        { name: "Actions for Contact" },
      ),
    );
    await user.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    expect(setSourceEnabled).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Deactivate “Contact”?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    expect(setSourceEnabled).toHaveBeenCalledWith("contact-form", false);
    expect(onChanged).toHaveBeenCalled();
  });

  test("offers activation and permanent deletion only for inactive Sources", async () => {
    const user = userEvent.setup();
    render(
      <SourcesList
        sources={[
          {
            type: "one-shot" as const,
            pipelineCount: 0, pageCount: 0,
            enabled: false,
            sourceId: "survey-form",
            id: "2",
            lastSubmission: null,
            name: "Survey",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
          },
        ]}
      />,
    );

    await user.click(
      within(screen.getByRole("table", { name: "Sources" })).getByRole(
        "button",
        { name: "Actions for Survey" },
      ),
    );
    expect(screen.getByRole("menuitem", { name: "Activate" })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    ).toBeVisible();
  });

  test("paginates Sources with ten rows by default", async () => {
    const user = userEvent.setup();
    const sources = Array.from({ length: 11 }, (_, index) => ({
      type: "one-shot" as const,
      pipelineCount: 0, pageCount: 0,
      enabled: true,
      sourceId: `form-${index + 1}`,
      id: String(index + 1),
      lastSubmission: null,
      name: `Source ${index + 1}`,
      submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
    }));

    render(<SourcesList sources={sources} />);

    expect(screen.getAllByRole("button", { name: "10" })[0]).toBeVisible();
    expect(screen.queryByText("Source 11")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Next page" })[0]);
    expect(screen.getAllByText("Source 11").length).toBeGreaterThan(0);
  });

  test("reports filter and pagination changes for a URL-backed collection", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    const sources = Array.from({ length: 11 }, (_, index) => ({
      type: "one-shot" as const,
      pipelineCount: 0, pageCount: 0,
      enabled: true,
      sourceId: `form-${index + 1}`,
      id: String(index + 1),
      lastSubmission: null,
      name: `Source ${index + 1}`,
      submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
      tags:
        index === 0
          ? [{ id: "sales", name: "Sales", color: "blue" as const }]
          : [],
    }));

    render(
      <SourcesList
        initialQuery={{ page: "2", size: "50", tagId: "sales" }}
        onQueryChange={onQueryChange}
        sources={sources}
        tags={[
          { id: "sales", name: "Sales", color: "blue" },
          { id: "support", name: "Support", color: "mint" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Support" }));
    expect(onQueryChange).toHaveBeenCalledWith({
      page: "1",
      size: "50",
      tagId: ["sales", "support"],
      search: "",
      status: undefined,
    });
  });
});

test("shows the total with the period breakdown on keyboard focus", async()=>{
  const user=userEvent.setup();
  render(<SourcesList sources={[{id:"stats",sourceId:"stats",name:"Stats",type:"one-shot",enabled:true,pipelineCount:0,pageCount:0,lastSubmission:null,totalSubmissionCount:42,submissionsLast24Hours:2,submissionsLast7Days:8,submissionsLast30Days:16}]} />);
  const table=screen.getByRole("table",{name:"Sources"});
  expect(within(table).getByRole("columnheader",{name:"Submissions"})).toBeInTheDocument();
  const button=within(table).getByRole("button",{name:"Submission statistics for Stats"});
  expect(within(table).getByText("42")).toBeVisible();
  button.focus();
  const tooltip=await screen.findByRole("tooltip");
  for(const text of ["24 h: 2","7 d: 8","30 d: 16","Total: 42"]) expect(within(tooltip).getByText(text)).toBeInTheDocument();
  await user.tab();
});
