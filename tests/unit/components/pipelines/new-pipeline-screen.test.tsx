import { AdminApiError } from "@/client/admin-api/client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EditPipelineScreen } from "@/components/pipelines/new-pipeline-screen";

const {
  deletePipeline,
  deletePipelineAction,
  createPipelineAction,
  createPipelineConfiguration,
  go,
  movePipelineAction,
  listSources,
  updatePipelineAction,
  updatePipelineConfiguration,
} = vi.hoisted(() => ({
  deletePipeline: vi.fn(),
  deletePipelineAction: vi.fn(),
  createPipelineAction: vi.fn(),
  createPipelineConfiguration: vi.fn(),
  go: vi.fn(),
  movePipelineAction: vi.fn(),
  listSources: vi.fn(),
  updatePipelineAction: vi.fn(),
  updatePipelineConfiguration: vi.fn(),
}));

vi.mock("@/client/admin-api/pipelines", () => ({
  deletePipeline,
  deletePipelineAction,
  movePipelineAction,
  createPipelineAction,
  createPipelineConfiguration,
  updatePipelineAction,
  updatePipelineConfiguration,
}));
vi.mock("@/client/admin-api/sources", () => ({ listSources }));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go }),
}));

const pipeline = {
  enabled: true,
  id: "flow-1",
  name: "Verify contact",
  sourceId: "source-1", sourcePublicId: "public-source-1",
  sourceName: "Contact",
  tags: [],
  steps: [
    {
      blocking: true,
      condition: null,
      conditionMissBehavior: "skip_action" as const,
      configuration: { expression: "payload" },
      enabled: true,
      failurePolicy: "cancel" as const,
      id: "action-1",
      maximumAttempts: 3,
      name: "Normalize payload",
      position: 1,
      type: "transformation" as const,
    },
  ],
};

afterEach(cleanup);

describe("NewPipelineScreen", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    listSources.mockResolvedValue([
      { id: "source-1", name: "Contact", enabled: true },
    ]);
    createPipelineConfiguration.mockResolvedValue({ id: "flow-1" });
    updatePipelineConfiguration.mockResolvedValue(pipeline);
    updatePipelineAction.mockResolvedValue(pipeline);
    createPipelineAction.mockResolvedValue({
      ...pipeline,
      steps: [
        ...pipeline.steps,
        {
          ...pipeline.steps[0],
          id: "action-2",
          name: "Untitled Action",
          position: 2,
        },
      ],
    });
  });

  test("saves configuration without submitting Actions", async () => {
    render(<EditPipelineScreen pipeline={pipeline} />);
    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Verify customer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(updatePipelineConfiguration).toHaveBeenCalledWith("flow-1", {
        enabled: true,
        name: "Verify customer",
      }),
    );
    expect(updatePipelineAction).not.toHaveBeenCalled();
  });

  test("saves an edited Action directly from its accordion", async () => {
    render(<EditPipelineScreen pipeline={pipeline} />);
    await screen.findByLabelText("Name");
    fireEvent.click(
      screen.getByRole("button", { name: /Action 1.*Transformation/ }),
    );
    fireEvent.change(screen.getByLabelText(/^Action 1 name/), {
      target: { value: "Normalize contact" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Save Action" }));
    await waitFor(() =>
      expect(updatePipelineAction).toHaveBeenCalledWith(
        "flow-1",
        "action-1",
        expect.objectContaining({ name: "Normalize contact" }),
      ),
    );
    expect(updatePipelineConfiguration).not.toHaveBeenCalled();
  });

  test("adding an Action collapses previous panels but preserves drafts and manual expansion", async () => {
    render(<EditPipelineScreen pipeline={pipeline} />);
    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: /Action 1.*Transformation/ }));
    fireEvent.change(screen.getByLabelText(/^Action 1 name/), { target: { value: "Unsaved first" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Action" }));
    await waitFor(() => expect(screen.getByLabelText(/^Action 2 name/)).toHaveFocus());
    expect(screen.getByRole("button", { name: /Action 1.*Transformation/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Action 2.*Transformation/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByLabelText(/^Action 2 name/), { target: { value: "Unsaved second" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Action" }));
    await waitFor(() => expect(screen.getByLabelText(/^Action 3 name/)).toHaveFocus());
    expect(screen.getByRole("button", { name: /Action 2.*Transformation/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /Action 1.*Transformation/ }));
    fireEvent.click(screen.getByRole("button", { name: /Action 2.*Transformation/ }));
    expect(screen.getByLabelText(/^Action 1 name/)).toHaveValue("Unsaved first");
    expect(screen.getByLabelText(/^Action 2 name/)).toHaveValue("Unsaved second");
    expect(screen.getByRole("button", { name: /Action 3.*Transformation/ })).toHaveAttribute("aria-expanded", "true");
    expect(createPipelineAction).not.toHaveBeenCalled();
    expect(updatePipelineAction).not.toHaveBeenCalled();
  });

  test("shows a draft Action and creates it from its accordion", async () => {
    render(<EditPipelineScreen pipeline={pipeline} />);
    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: "Add Action" }));
    fireEvent.change(screen.getByLabelText(/^Action 2 name/), {
      target: { value: "Store copy" },
    });
    expect(screen.getByText("Draft")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Save Action" }));
    await waitFor(() =>
      expect(createPipelineAction).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ name: "Store copy", type: "transformation" }),
      ),
    );
  });

  test("saving one Action preserves a different Action draft and its open section", async () => {
    const twoActions = {
      ...pipeline,
      steps: [
        ...pipeline.steps,
        {
          ...pipeline.steps[0],
          id: "action-2",
          name: "Second Action",
          position: 2,
        },
      ],
    };
    updatePipelineAction.mockResolvedValue({
      ...twoActions,
      steps: [
        { ...twoActions.steps[0], name: "Saved first" },
        twoActions.steps[1],
      ],
    });
    render(<EditPipelineScreen pipeline={twoActions} />);
    await screen.findByLabelText("Name");
    fireEvent.click(
      screen.getByRole("button", { name: /Action 1.*Transformation/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Action 2.*Transformation/ }),
    );
    fireEvent.change(screen.getByLabelText(/^Action 1 name/), {
      target: { value: "Saved first" },
    });
    fireEvent.change(screen.getByLabelText(/^Action 2 name/), {
      target: { value: "Unsaved second" },
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Save Action" }),
      ).toHaveLength(2),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Save Action" })[0]);
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Save Action" })[0],
      ).toBeDisabled(),
    );
    expect(
      screen.getAllByRole("button", { name: "Save Action" })[1],
    ).toBeEnabled();
    expect(screen.getByLabelText(/^Action 2 name/)).toHaveValue(
      "Unsaved second",
    );
    expect(screen.getByLabelText(/^Action 1 name/)).toHaveValue("Saved first");
  });

  test("requires confirmation before removing a persisted Action", async () => {
    const user = userEvent.setup();
    deletePipelineAction.mockResolvedValue({ ...pipeline, steps: [] });
    render(<EditPipelineScreen pipeline={pipeline} />);
    await screen.findByLabelText("Name");
    await user.click(
      screen.getByRole("button", { name: "Actions for Action 1" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Remove Action" }));
    expect(deletePipelineAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deletePipelineAction).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Actions for Action 1" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Remove Action" }));
    await user.click(screen.getByRole("button", { name: "Remove Action" }));
    await waitFor(() =>
      expect(deletePipelineAction).toHaveBeenCalledWith("flow-1", "action-1"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Actions for Action 1" }),
      ).not.toBeInTheDocument(),
    );
  });

  test("allows deleting only a saved disabled Pipeline", async () => {
    const user = userEvent.setup();
    render(<EditPipelineScreen pipeline={pipeline} />);
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Pipeline actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Disable the Pipeline to delete it."),
    ).toBeInTheDocument();
  });

  test("confirms Pipeline deletion and returns to Pipelines", async () => {
    const user = userEvent.setup();
    deletePipeline.mockResolvedValue(undefined);
    render(<EditPipelineScreen pipeline={{ ...pipeline, enabled: false }} />);
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Pipeline actions" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    );
    expect(deletePipeline).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    await waitFor(() => expect(deletePipeline).toHaveBeenCalledWith("flow-1"));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/app/pipelines"));
  });

  test("keeps the dialog open with the server reason when deletion is refused", async () => {
    const user = userEvent.setup();
    deletePipeline.mockRejectedValue(
      new AdminApiError(409, "Wait until the Pipeline's Runs finish, then delete it."),
    );
    render(<EditPipelineScreen pipeline={{ ...pipeline, enabled: false }} />);
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Pipeline actions" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(
      await screen.findByText("Wait until the Pipeline's Runs finish, then delete it."),
    ).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });

  test("keeps action type and processing visible in a collapsed row", async () => {
    render(<EditPipelineScreen pipeline={pipeline} />);
    await screen.findByLabelText("Name");
    const action = screen.getByRole("button", {
      name: /Action 1.*Transformation/,
    });
    fireEvent.click(action);
    expect(action).toHaveTextContent("Blocking · Cancel · 3 attempts");
    expect(action).toHaveTextContent("Enabled");
    expect(
      await screen.findByRole("button", { name: "Save Action" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Action 1 name/), {
      target: { value: "Normalize customer" },
    });
    expect(screen.getByRole("button", { name: "Save Action" })).toBeVisible();
  });
});

test("keeps unchanged configuration save visible", async () => {
  listSources.mockResolvedValue([]);
  render(<EditPipelineScreen pipeline={pipeline} />);
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("reveals a late action save failure without losing the draft", async () => {
  let reject!: (error: Error) => void;
  listSources.mockResolvedValue([]);
  updatePipelineAction.mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectSave) => {
        reject = rejectSave;
      }),
  );
  const user = userEvent.setup();
  render(<EditPipelineScreen pipeline={pipeline} />);
  await user.click(
    screen.getByRole("button", { name: /Action 1.*Transformation/ }),
  );
  await user.type(screen.getByLabelText(/^Action 1 name/), " edited");
  await user.click(screen.getByRole("button", { name: "Save Action" }));
  await user.click(
    screen.getByRole("button", { name: /Action 1.*Transformation/ }),
  );
  await act(async () => reject(new Error("offline")));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Action 1.*Transformation/ }),
    ).toHaveAttribute("aria-expanded", "true"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be saved",
  );
  expect(screen.getByLabelText(/^Action 1 name/)).toHaveValue(
    "Normalize payload edited",
  );
});

test.each([
  ["Webhook", "Webhook URL"],
  ["CouchDB", "CouchDB server URL"],
  ["Callback", "Callback timeout (hours)"],
  ["Callback Touch", "Payload field"],
  ["E-mail", "Recipients"],
  ["Email Confirmation", "Email payload field"],
])("opens %s configuration with labeled controls", async (type, label) => {
  listSources.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<EditPipelineScreen pipeline={pipeline} />);
  await user.click(
    screen.getByRole("button", { name: /Action 1.*Transformation/ }),
  );
  await user.click(screen.getByRole("combobox", { name: "Action 1 type" }));
  await user.click(screen.getByRole("option", { name: type }));
  expect(screen.getByLabelText(label, { exact: false })).toBeVisible();
});

test("shows a move failure for an Action that has never been opened", async () => {
  listSources.mockResolvedValue([]);
  movePipelineAction.mockRejectedValueOnce(new Error("offline"));
  const two = {
    ...pipeline,
    steps: [
      ...pipeline.steps,
      { ...pipeline.steps[0], id: "action-2", position: 2, name: "Second" },
    ],
  };
  render(<EditPipelineScreen pipeline={two} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Move Action 1 down" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be moved",
  );
});

test("successful move retry clears its previous error", async () => {
  listSources.mockResolvedValue([]);
  const two = {...pipeline, steps: [...pipeline.steps, {...pipeline.steps[0], id: "action-2", name: "Second", position: 2}]};
  movePipelineAction.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({...two, steps: [{...two.steps[1], position: 1}, {...two.steps[0], position: 2}]});
  render(<EditPipelineScreen pipeline={two} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name: "Move Action 1 down"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be moved");
  await user.click(screen.getByRole("button", {name: "Move Action 1 down"}));
  await screen.findByRole("button", {name: /Action 1\. Second/});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("shows JSONata rejection at the expression and clears it when corrected", async () => {
  listSources.mockResolvedValue([]);
  updatePipelineAction.mockRejectedValueOnce(new AdminApiError(400, "Invalid JSONata transformation: Unexpected end"));
  render(<EditPipelineScreen pipeline={pipeline} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name: /Action 1\. Normalize/}));
  const expression = screen.getByRole("textbox", {name: "Transformation (JSONata)"});
  fireEvent.change(expression, {target: {value: "("}});
  await user.click(screen.getByRole("button", {name: "Save Action"}));
  await waitFor(() => expect(expression).toHaveAttribute("aria-invalid", "true"));
  fireEvent.change(expression, {target: {value: "{}"}});
  expect(expression).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("prefills Email subject from Source and defaults to Formatted", async () => {
  const user = userEvent.setup();
  render(<EditPipelineScreen pipeline={pipeline} />);
  await user.click(screen.getByRole("button", { name: /Action 1.*Transformation/ }));
  await user.click(screen.getByRole("combobox", { name: "Action 1 type" }));
  await user.click(screen.getByRole("option", { name: "E-mail" }));
  expect(screen.getByRole("textbox", { name: /^Subject/ })).toHaveValue("Contact");
  expect(screen.getByRole("combobox", { name: "Content format" })).toHaveValue("Formatted");
  await user.clear(screen.getByRole("textbox", { name: /^Subject/ }));
  await user.type(screen.getByLabelText(/^Recipients/), "to@example.test");
  await user.click(screen.getByRole("button", { name: "Save Action" }));
  expect(await screen.findByText("Enter subject.")).toBeVisible();
});

test("existing Email Actions keep JSON and their original subject", async () => {
  const existing = { ...pipeline, steps: [{ ...pipeline.steps[0], type: "email" as const, name: "Mail", configuration: { recipients: ["to@example.test"] } }] };
  render(<EditPipelineScreen pipeline={existing} />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Action 1.*Mail/ }));
  expect(screen.getByRole("textbox", { name: /^Subject/ })).toHaveValue("Forman pipeline output");
  expect(screen.getByRole("combobox", { name: "Content format" })).toHaveValue("JSON");
  expect(screen.getByRole("button", { name: "Save Action" })).toBeDisabled();
});

test("a Source rename does not replace a saved Email subject", async () => {
  const existing = { ...pipeline, sourceName: "Renamed Source", steps: [{ ...pipeline.steps[0], type: "email" as const, name: "Mail", configuration: { recipients: ["to@example.test"], subject: "Original Source", contentFormat: "formatted" } }] };
  render(<EditPipelineScreen pipeline={existing} />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Action 1.*Mail/ }));
  expect(screen.getByRole("textbox", { name: /^Subject/ })).toHaveValue("Original Source");
});

test.each([
  ["", "Enter at least one email recipient."],
  ["invalid-address", "Enter a valid email address on each line."],
])("Email validation identifies recipients (%s), not a filled name", async (recipients, message) => {
  const existing = { ...pipeline, steps: [{ ...pipeline.steps[0], type: "email" as const, name: "Mail", configuration: { recipients: ["to@example.test"], subject: "Contact" } }] };
  render(<EditPipelineScreen pipeline={existing} />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Action 1.*Mail/ }));
  const field = screen.getByRole("textbox", { name: /Recipients/ });
  fireEvent.change(field, { target: { value: recipients } });
  fireEvent.click(screen.getByRole("button", { name: "Save Action" }));
  expect(await screen.findByText(message)).toBeVisible();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveFocus();
  expect(screen.getByRole("textbox", { name: /Action 1 name/ })).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByText("Enter a name and complete the required fields.")).not.toBeInTheDocument();
  fireEvent.change(field, { target: { value: "valid@example.test" } });
  expect(screen.queryByText(message)).not.toBeInTheDocument();
});

test.each([
  ["couchdb", { url: "https://db.example.test", username: "user", passwordConfigured: true, database: "" }, "Database"],
  ["callback_boolean", { url: "https://example.test/callback", timeoutSeconds: 60, field: "" }, "Payload field"],
  ["email_confirmation", { emailField: "", booleanField: "confirmed", completedText: "Done", confirmationCtaLabel: "Confirm", confirmationText: "Confirm", emailCtaLabel: "Open", emailText: "Please confirm", subject: "Confirmation", timeoutHours: 24 }, "Email payload field"],
])("identifies missing %s configuration without blaming the name", async (type, configuration, label) => {
  listSources.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<EditPipelineScreen pipeline={{ ...pipeline, steps: [{ ...pipeline.steps[0], type: type as typeof pipeline.steps[0]["type"], configuration }] }} />);
  await user.click(screen.getByRole("button", { name: /Action 1\. Normalize/ }));
  await user.type(screen.getByLabelText(/^Action 1 name/), " edited");
  await user.click(screen.getByRole("button", { name: "Save Action" }));
  const field = screen.getByLabelText(label, { exact: false });
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveFocus();
  expect(screen.getByLabelText(/^Action 1 name/)).not.toHaveAttribute("aria-invalid", "true");
});

test("keeps a configured CouchDB password optional when saving other fields", async () => {
  listSources.mockResolvedValue([]);
  updatePipelineAction.mockResolvedValue(pipeline);
  const before = updatePipelineAction.mock.calls.length;
  const user = userEvent.setup();
  render(<EditPipelineScreen pipeline={{ ...pipeline, steps: [{ ...pipeline.steps[0], type: "couchdb", configuration: { url: "https://db.example.test", database: "archive", username: "user", passwordConfigured: true } }] }} />);
  await user.click(screen.getByRole("button", { name: /Action 1\. Normalize/ }));
  await user.type(screen.getByLabelText(/^Action 1 name/), " edited");
  expect(screen.getByLabelText("Password", { exact: false })).not.toBeRequired();
  await user.click(screen.getByRole("button", { name: "Save Action" }));
  await waitFor(() => expect(updatePipelineAction.mock.calls.length).toBe(before + 1));
});

test("allows typing recipients on separate lines and trims them only for saving", async () => {
  listSources.mockResolvedValue([]);
  updatePipelineAction.mockResolvedValue(pipeline);
  const user = userEvent.setup();
  render(<EditPipelineScreen pipeline={{ ...pipeline, steps: [{ ...pipeline.steps[0], type: "email", configuration: { recipients: ["first@example.test"], subject: "Contact" } }] }} />);
  await user.click(screen.getByRole("button", { name: /Action 1\. Normalize/ }));
  const recipients = screen.getByRole("textbox", { name: /Recipients/ });
  await user.click(recipients);
  await user.keyboard("{End}{Enter}second@example.test");
  expect(recipients).toHaveValue("first@example.test\nsecond@example.test");
  await user.click(screen.getByRole("button", { name: "Save Action" }));
  await waitFor(() => expect(updatePipelineAction).toHaveBeenLastCalledWith(
    expect.anything(), expect.anything(), expect.objectContaining({
      configuration: expect.objectContaining({ recipients: ["first@example.test", "second@example.test"] })
    })
  ));
});
