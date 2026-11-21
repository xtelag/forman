import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const { go, refresh } = vi.hoisted(() => ({ go: vi.fn(), refresh: vi.fn() }));

vi.mock("@/components/layout/app-link", () => ({
  useAppNavigation: () => ({ go, refresh }),
  AppLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import { CreatePipelineDialog } from "@/components/pipelines/create-pipeline-dialog";

describe("CreatePipelineDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test.each([false, true])("requires an existing Source and opens the created Pipeline", async (contextual) => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue({ id: "abcdefgh02" });
    render(
      <CreatePipelineDialog
        initialSourceId={contextual ? "form-1" : undefined}
        initiallyOpen={contextual}
        create={create}
        loadSources={async () => [
          {
            createdAt: "2026-08-21T08:00:00.000Z",
            type: "one-shot",
            pipelineCount: 0, pageCount: 0,
            enabled: true,
            fieldDefinitionMode: "json-schema",
            fieldDefinitionSource:
              '["name","type","minLength","maxLength","required"]\\n["email","string",null,254,true]',
            sourceId: "contact",
            id: "form-1",
            lastSubmission: null,
            name: "Contact",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
            updatedAt: "2026-08-21T08:00:00.000Z",
          },
        ]}
      />,
    );

    if (!contextual) await user.click(screen.getByRole("button", { name: "Create Pipeline" }));
    expect(screen.getByText("Source", { selector: "label" })).toHaveAttribute(
      "for",
      "pipeline-create-source",
    );
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveAttribute(
      "id",
      "pipeline-create-source",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Contact Prague",
    );
    if (!contextual) {
    await user.click(screen.getByRole("combobox", { name: "Source" }));
    await user.click(await screen.findByRole("option", { name: "Contact" }));
    }
    await user.click(
      within(screen.getByRole("dialog", { name: "Create Pipeline" })).getByRole(
        "button",
        { name: "Create Pipeline" },
      ),
    );

    expect(create).toHaveBeenCalledWith({
      sourceId: "form-1",
      name: "Contact Prague",
    });
    expect(go).toHaveBeenCalledWith("/app/pipelines/abcdefgh02");
    expect(refresh).not.toHaveBeenCalled();
  });

  test("does not create a Pipeline without an available Source", async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    render(
      <CreatePipelineDialog create={create} loadSources={async () => []} />,
    );
    await user.click(screen.getByRole("button", { name: "Create Pipeline" }));
    expect(await screen.findByText(/Create or enable a/)).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Create Pipeline" }).at(-1),
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
