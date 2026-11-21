import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const { go, refresh } = vi.hoisted(() => ({ go: vi.fn(), refresh: vi.fn() }));

vi.mock("@/components/layout/app-link", () => ({
  useAppNavigation: () => ({ go, refresh }),
  AppLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import { CreatePageDialog } from "@/components/pages/create-page-dialog";
import { AdminApiError } from "@/client/admin-api/client";

describe("CreatePageDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test.each([false, true])("requires an existing Source and opens the created Page", async (contextual) => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue({ pageId: "abcdefgh02" });
    render(
      <CreatePageDialog
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

    if (!contextual) await user.click(screen.getByRole("button", { name: "Create Built-in Form" }));
    expect(screen.getByText("Source", { selector: "label" })).toHaveAttribute(
      "for",
      "page-source",
    );
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveAttribute(
      "id",
      "page-source",
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
      within(screen.getByRole("dialog", { name: "Create Built-in Form" })).getByRole(
        "button",
        { name: "Create Built-in Form" },
      ),
    );

    expect(create).toHaveBeenCalledWith({
      sourceId: "form-1",
      name: "Contact Prague",
    });
    expect(go).toHaveBeenCalledWith("/app/pages/abcdefgh02");
    expect(refresh).not.toHaveBeenCalled();
  });

  test("offers only browser Sources with Form fields", async () => {
    const user = userEvent.setup();
    render(
      <CreatePageDialog
        loadSources={async () => [
          {
            createdAt: "2026-08-21T08:00:00.000Z",
            type: "one-shot",
            pipelineCount: 0, pageCount: 0,
            enabled: true,
            fieldDefinitionMode: null,
            fieldDefinitionSource: null,
            sourceId: "empty",
            id: "source-empty",
            lastSubmission: null,
            name: "No fields",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
            updatedAt: "2026-08-21T08:00:00.000Z",
          },
          {
            createdAt: "2026-08-21T08:00:00.000Z",
            type: "m2m",
            pipelineCount: 0, pageCount: 0,
            enabled: true,
            fieldDefinitionMode: "json-schema",
            fieldDefinitionSource:
              '{"type":"object","properties":{"email":{"type":"string"}}}',
            sourceId: "trusted",
            id: "source-trusted",
            lastSubmission: null,
            name: "Trusted server",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
            updatedAt: "2026-08-21T08:00:00.000Z",
          },
          {
            createdAt: "2026-08-21T08:00:00.000Z",
            type: "one-shot",
            pipelineCount: 0, pageCount: 0,
            enabled: true,
            fieldDefinitionMode: "json-schema",
            fieldDefinitionSource:
              '{"type":"object","properties":{"email":{"type":"string"}}}',
            sourceId: "contact",
            id: "source-contact",
            lastSubmission: null,
            name: "Contact",
            submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0,
            updatedAt: "2026-08-21T08:00:00.000Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Built-in Form" }));
    await user.click(screen.getByRole("combobox", { name: "Source" }));

    expect(
      screen.queryByRole("option", { name: "No fields" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Trusted server" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Contact" })).toBeVisible();
  });

  test("shows the server reason when Page creation is rejected", async () => {
    const user = userEvent.setup();
    render(
      <CreatePageDialog
        create={vi
          .fn()
          .mockRejectedValue(
            new AdminApiError(403, "Untrusted administrator request origin"),
          )}
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

    await user.click(screen.getByRole("button", { name: "Create Built-in Form" }));
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Contact Prague",
    );
    await user.click(screen.getByRole("combobox", { name: "Source" }));
    await user.click(await screen.findByRole("option", { name: "Contact" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Create Built-in Form" })).getByRole(
        "button",
        { name: "Create Built-in Form" },
      ),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Untrusted administrator request origin",
    );
  });
});

test("recovers a Source loading failure without discarding the entered name", async () => {
  const user = userEvent.setup();
  const loadSources = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  render(<CreatePageDialog loadSources={loadSources} />);
  await user.click(screen.getByRole("button", { name: "Create Built-in Form" }));
  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "My form",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sources could not be loaded",
  );
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("link", { name: "Source" }),
  ).toHaveAttribute("href", "/app/sources");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
    "My form",
  );
  expect(
    within(screen.getByRole("dialog", { name: "Create Built-in Form" })).getByRole(
      "button",
      { name: "Create Built-in Form" },
    ),
  ).toBeDisabled();
  cleanup();
});
