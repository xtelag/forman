import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { PageConfiguration } from "@/components/pages/page-configuration";
import type { AdminPageDetail } from "@/shared/contracts/admin";
vi.mock("@/components/layout/app-link", () => ({
  AppLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/components/pages/page-qr-code", () => ({
  PageQrCode: () => <div>QR</div>,
  createPageQrDownloadSvg: vi.fn(),
}));
afterEach(cleanup);
const page: AdminPageDetail = {
  id: "p",
  pageId: "public",
  name: "Survey",
  sourceId: "s",
  sourcePublicId: "source",
  sourceName: "Source",
  publicUrl: "https://forms.test/pages/public",
  enabled: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  tags: [],
  presentation: null,
  fields: [],
};
test("saves sections independently while preserving another draft", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async (_id, input) => ({
    ...page,
    ...input,
    updatedAt: "2026-01-02T00:00:00Z",
  }));
  render(<PageConfiguration page={page} save={save} />);
  expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Unsaved name");
  await user.click(screen.getByRole("button", { name: "Copy public URL" }));
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("tab", { name: "Content & fields" }));
  await user.clear(screen.getByLabelText("Content & fields (JSON)"));
  await user.paste('{"title":"Hello","introduction":"Welcome","fields":[]}');
  await user.click(
    (await screen.findAllByRole("button", { name: "Save form" }))[0],
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith("public", {
      name: "Survey",
      enabled: false,
      presentation: {
        title: "Hello",
        description: "Welcome",
        steps: [{ id: 1, title: "" }],
        fields: [],
        fallbacks: {},
      },
    }),
  );
  expect(screen.getByLabelText("Name")).toHaveValue("Unsaved name");
  await user.click(screen.getByRole("tab", { name: "Configuration" }));
  await user.click(screen.getByRole("button", { name: "Save configuration" }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith("public", {
      name: "Unsaved name",
      enabled: false,
      presentation: {
        title: "Hello",
        description: "Welcome",
        steps: [{ id: 1, title: "" }],
        fields: [],
        fallbacks: {},
      },
    }),
  );
});
test("keeps an edited section on failure and offers retry", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockRejectedValue(new Error());
  render(<PageConfiguration page={page} save={save} />);
  expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.type(screen.getByLabelText("Name"), " edited");
  await user.click(screen.getByRole("tab", { name: "Configuration" }));
  await user.click(screen.getByRole("button", { name: "Save configuration" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be saved",
  );
  expect(screen.getByLabelText("Name")).toHaveValue("Survey edited");
});

test("edits a HEX color and saves it independently", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async (_id, input) => ({ ...page, ...input }));
  render(<PageConfiguration page={page} save={save} />);
  await user.click(screen.getByRole("tab", { name: "Appearance" }));
  await user.clear(screen.getByLabelText("Button color", { exact: true }));
  await user.type(
    screen.getByLabelText("Button color", { exact: true }),
    "#123abc",
  );
  await user.click(screen.getByRole("button", { name: "Save appearance" }));
  expect(save).toHaveBeenCalledWith(
    "public",
    expect.objectContaining({ presentation: { theme: { button: "#123abc" } } }),
  );
});

test("JSON saves the full field presentation and preserves invalid text", async () => {
  const user = userEvent.setup();
  const fields = [
    {
      name: "name",
      label: "Name",
      page: 1,
      valueType: "string" as const,
      htmlControl: "text" as const,
      required: true,
    },
  ];
  const survey = { ...page, fields, sessionsEnabled: true };
  const save = vi.fn(async (_id, input) => ({ ...survey, ...input }));
  const { rerender } = render(<PageConfiguration page={survey} save={save} />);
  await user.click(screen.getByRole("tab", { name: "Content & fields" }));
  const editor = screen.getByLabelText("Content & fields (JSON)");
  await user.clear(editor);
  await user.paste("{bad}");
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid JSON");
  await user.click(
    (await screen.findAllByRole("button", { name: "Save form" }))[0],
  );
  expect(save).not.toHaveBeenCalled();
  rerender(
    <PageConfiguration
      page={{
        ...survey,
        updatedAt: "2026-01-02T00:00:00Z",
        presentation: { title: "Server update" },
      }}
      save={save}
    />,
  );
  expect(editor).toHaveValue("{bad}");
  await user.clear(editor);
  await user.paste(
    '{"steps":[{"id":3,"title":"About you","fields":[{"name":"name","label":"Jméno","helpText":"Help","placeholder":"Ada","input":"textarea","fallback":"Guest"}]}]}',
  );
  await user.click(
    (await screen.findAllByRole("button", { name: "Save form" }))[0],
  );
  expect(save.mock.calls[0][1].presentation).toMatchObject({
    steps: [{ id: 3, title: "About you" }],
    fields: [
      {
        name: "name",
        step: 3,
        order: 0,
        label: "Jméno",
        helpText: "Help",
        placeholder: "Ada",
        textControl: "textarea",
      },
    ],
    fallbacks: { name: "Guest" },
  });
});

test("one-shot exposes field rows without step controls", async () => {
  const user = userEvent.setup();
  render(
    <PageConfiguration
      page={{
        ...page,
        fields: [
          {
            name: "name",
            label: "Name",
            page: 1,
            valueType: "string",
            htmlControl: "text",
            required: true,
          },
        ],
      }}
      save={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("tab", { name: "Content & fields" }));
  expect(
    JSON.parse(
      (screen.getByLabelText("Content & fields (JSON)") as HTMLTextAreaElement)
        .value,
    ),
  ).toEqual({ title: "", introduction: "", fields: [{ name: "name" }] });
  expect(
    screen.queryByRole("button", { name: "Add step" }),
  ).not.toBeInTheDocument();
});

test("normalizes JSON immediately after a formatting-only save", async () => {
  const user = userEvent.setup();
  const survey: AdminPageDetail = {
    ...page,
    sessionsEnabled: true,
    fields: ["first", "second"].map((name) => ({
      name,
      label: name,
      page: 1,
      valueType: "string",
      htmlControl: "text",
      required: true,
    })),
    presentation: {
      steps: [
        { id: 1, title: "First" },
        { id: 3, title: "Second" },
      ],
      fields: [
        { name: "first", step: 1, order: 0 },
        { name: "second", step: 3, order: 1 },
      ],
    },
  };
  const save = vi.fn(async () => survey);
  render(<PageConfiguration page={survey} save={save} />);
  await user.click(screen.getByRole("tab", { name: "Content & fields" }));
  const editor = screen.getByLabelText(
    "Content & fields (JSON)",
  ) as HTMLTextAreaElement;
  const formatted = editor.value;
  expect(JSON.parse(formatted).steps[1].id).toBe(3);
  await user.clear(editor);
  await user.paste(JSON.stringify(JSON.parse(formatted)));
  await user.click(
    (await screen.findAllByRole("button", { name: "Save form" }))[0],
  );
  await waitFor(() => expect(editor).toHaveValue(formatted));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Save form" })).toBeDisabled();
});

test("system JSON blocks invalid saves, preserves its draft and resets without saving", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async (_id, input) => ({ ...page, ...input }));
  render(<PageConfiguration page={page} save={save} />);
  await user.click(screen.getByRole("tab", { name: "Content & fields" }));
  await user.click(screen.getByRole("tab", { name: "Buttons & messages" }));
  const editor = screen.getByLabelText("Buttons & messages (JSON)");
  await user.clear(editor);
  await user.paste('{"minimum":"No variable"}');
  await user.click(
    (await screen.findAllByRole("button", { name: "Save form" }))[0],
  );
  expect(save).not.toHaveBeenCalled();
  expect(editor).toHaveValue('{"minimum":"No variable"}');
  expect(screen.queryByLabelText("System language")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(editor).toHaveValue('{"minimum":"No variable"}');
  await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
  await user.click(
    screen.getAllByRole("button", { name: "Reset to defaults" }).at(-1)!,
  );
  expect((editor as HTMLTextAreaElement).value).toContain('"submit": "Submit"');
  expect(save).not.toHaveBeenCalled();
  await user.clear(editor);
  await user.paste('{"submit":"Send answers"}');
  await user.click(
    (await screen.findAllByRole("button", { name: "Save form" }))[0],
  );
  expect(save).toHaveBeenCalledWith(
    "public",
    expect.objectContaining({
      presentation: expect.objectContaining({
        language: "en",
        systemTexts: { submit: "Send answers" },
      }),
    }),
  );
  expect((editor as HTMLTextAreaElement).value).toContain(
    '"submit": "Send answers"',
  );
  expect(screen.queryByText("Button labels")).not.toBeInTheDocument();
});

test("saves confirmation with messages while preserving the Main redirect draft", async () => {
  const user = userEvent.setup();
  const initial = {
    ...page,
    presentation: {
      successText: "Old message",
      successUrl: "https://example.test/old",
    },
  };
  const save = vi.fn(async (_id, input) => ({ ...initial, ...input }));
  render(<PageConfiguration page={initial} save={save} />);
  expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Unsaved name");
  expect(
    screen.queryByRole("button", { name: "Completion" }),
  ).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Redirect URL"));
  await user.type(
    screen.getByLabelText("Redirect URL"),
    "https://example.test/new",
  );
  await user.click(screen.getByRole("tab", { name: "Buttons & messages" }));
  await user.clear(screen.getByLabelText("Buttons & messages (JSON)"));
  await user.paste('{"submit":"Send","confirmationText":"Thank you"}');
  await user.click(screen.getByRole("tab", { name: "Buttons & messages" }));
  if (
    screen
      .getByRole("tab", { name: "Content & fields" })
      .getAttribute("aria-selected") !== "true"
  )
    await user.click(screen.getByRole("tab", { name: "Content & fields" }));
  await user.click(
    (await screen.findAllByRole("button", { name: "Save form" }))[0],
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      "public",
      expect.objectContaining({
        name: "Survey",
        presentation: expect.objectContaining({
          successText: "Thank you",
          systemTexts: { submit: "Send" },
        }),
      }),
    ),
  );
  expect(save.mock.calls[0][1].presentation.successUrl).toBe(
    "https://example.test/old",
  );
  expect(screen.getByLabelText("Redirect URL")).toHaveValue(
    "https://example.test/new",
  );
  await user.click(screen.getByRole("tab", { name: "Configuration" }));
  await user.click(screen.getByRole("button", { name: "Save configuration" }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(
      "public",
      expect.objectContaining({
        name: "Unsaved name",
        presentation: expect.objectContaining({
          successText: "Thank you",
          successUrl: "https://example.test/new",
        }),
      }),
    ),
  );
  expect(screen.getByLabelText("Name")).toHaveValue("Unsaved name");
  await user.click(screen.getByRole("tab", { name: "Buttons & messages" }));
  expect(
    JSON.parse(
      (
        screen.getByLabelText(
          "Buttons & messages (JSON)",
        ) as HTMLTextAreaElement
      ).value,
    ).confirmationText,
  ).toBe("Thank you");
});

test("opens configuration immediately and keeps save actions stable", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async (_id, input) => ({ ...page, ...input }));
  render(<PageConfiguration page={page} save={save} />);
  expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("textbox", { name: "Name" })).toBeVisible();
  const button = screen.getByRole("button", { name: "Save configuration" });
  expect(button).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    " edited",
  );
  expect(button).toBeEnabled();
  await user.click(button);
  await waitFor(() => expect(button).toBeDisabled());
  expect(button).toBeVisible();
});

test("preserves field deep links into a closed appearance panel", async () => {
  window.location.hash = "page-logo-url-https-";
  try {
    render(<PageConfiguration page={page} save={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByLabelText("Logo URL (HTTPS)")).toHaveAttribute(
      "id",
      "page-logo-url-https-",
    );
  } finally {
    window.location.hash = "";
  }
});

test("reveals a rejected save after another tab was selected and preserves the draft", async () => {
  let reject!: (reason: Error) => void;
  const save = vi.fn(
    () =>
      new Promise<AdminPageDetail>((_resolve, rejectSave) => {
        reject = rejectSave;
      }),
  );
  const user = userEvent.setup();
  render(<PageConfiguration page={page} save={save} />);
  await user.type(screen.getByLabelText("Name"), " edited");
  await user.click(screen.getByRole("tab", { name: "Configuration" }));
  await user.click(screen.getByRole("button", { name: "Save configuration" }));
  await user.click(screen.getByRole("tab", { name: "Appearance" }));
  expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await act(async () => reject(new Error("offline")));
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be saved",
  );
  expect(screen.getByLabelText("Name")).toHaveValue("Survey edited");
});
test("downloads the QR code with the caption currently in the editor", async () => {
  const { createPageQrDownloadSvg } = await import(
    "@/components/pages/page-qr-code"
  );
  const user = userEvent.setup();
  render(<PageConfiguration page={page} save={vi.fn()} />);
  await user.click(screen.getByRole("tab", { name: "QR" }));
  await user.type(screen.getByLabelText("QR caption"), "Scan me");
  await user.click(screen.getByRole("button", { name: "Download QR" }));
  expect(createPageQrDownloadSvg).toHaveBeenCalledWith(
    "https://forms.test/pages/public",
    "Scan me",
  );
});

test("external publication changes survive saving an existing name draft",async()=>{const user=userEvent.setup();const initial={...page,enabled:true};const save=vi.fn(async(_id,values)=>({...initial,...values}));const view=render(<PageConfiguration page={initial} save={save}/>);await user.clear(screen.getByLabelText("Name"));await user.type(screen.getByLabelText("Name"),"Unsaved name");view.rerender(<PageConfiguration page={{...initial,enabled:false,updatedAt:"2026-01-02T00:00:00Z"}} save={save}/>);expect(screen.getByLabelText("Name")).toHaveValue("Unsaved name");expect(screen.getByLabelText("Published")).not.toBeChecked();await user.click(screen.getByRole("button",{name:"Save configuration"}));await waitFor(()=>expect(save).toHaveBeenCalledWith("public",expect.objectContaining({name:"Unsaved name",enabled:false})));});
