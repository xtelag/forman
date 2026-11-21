import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { SourcePage } from "@/components/public/source-page";
import type { PublicPageModel } from "@/server/pages/public-page-handler";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
const page: PublicPageModel = {
  presentation: {
    steps: [
      { id: 1, title: "" },
      { id: 3, title: "" },
    ],
  },
  altchaEnabled: false,
  challengeUrl: "/api/challenge/s",
  sourceId: "s",
  honeypotEnabled: false,
  honeypotFieldNames: ["trap"],
  pageId: "p",
  submissionUrl: "/api/submit/s",
  sessionUrl: "/api/submit/s",
  submitLabel: "Submit",
  title: "Hello {{name}}",
  fields: [
    {
      page: 1,
      valueType: "string",
      htmlControl: "text",
      label: "Name",
      name: "name",
      required: true,
      queryParam: "who",
      defaultValue: "Default",
    },
    {
      page: 3,
      valueType: "string",
      htmlControl: "email",
      label: "Email",
      name: "email",
      required: true,
    },
  ],
};
test("prefills only configured URL parameters and preview never sends requests", async () => {
  window.history.replaceState(null, "", "/?who=Ada&email=ignored@example.test");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(
    <SourcePage page={{ ...page, preview: true, sessionsEnabled: true }} />,
  );
  const previewBanner = screen.getByText("Preview mode. Answers will not be submitted and Pipeline Actions will not run.");
  expect(previewBanner).toBeVisible();
  expect(previewBanner.closest("section")).toBeNull();
  expect(screen.getByLabelText("Name")).toHaveValue("Ada");
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "50",
  );
  expect(screen.getByRole("heading")).toHaveTextContent("Hello Ada");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByLabelText("Email")).toHaveValue("");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  expect(screen.getByRole("progressbar")).toHaveAccessibleName("Step 2 of 2");
  await user.type(screen.getByLabelText("Email"), "ada@example.test");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(
    await screen.findByText("The response has been submitted."),
  ).toBeVisible();
  expect(screen.getByText("Preview completed. No answers were submitted and no Pipeline Actions were run.")).toBeVisible();
  expect(screen.queryByText("Preview mode. Answers will not be submitted and Pipeline Actions will not run.")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
test("one-shot displays every step and sends typed answers", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(<SourcePage page={page} />);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Email"), "ada@example.test");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/submit/s",
      expect.objectContaining({
        body: JSON.stringify({ name: "Default", email: "ada@example.test" }),
      }),
    ),
  );
});

test("retries an uncertain session save with the identical operation", async () => {
  const session = {
    status: "draft",
    payload: { name: "Default" },
    revision: 1,
    meta: { currentPage: 3, sessionUpdateCount: 1, sessionRequestCount: 3 },
    expiresAt: "2027-01-01",
    submissionId: null,
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...session, revision: 0 }),
    })
    .mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce({ ok: true, json: async () => session });
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(await screen.findByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(screen.getByLabelText("Email")).toBeVisible());
  expect(fetch.mock.calls[2][1].body).toBe(fetch.mock.calls[1][1].body);
});

test("keeps negative decimal input editable and submits a number", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(
    <SourcePage
      page={{
        ...page,
        fields: [
          {
            name: "amount",
            label: "Amount",
            page: 1,
            valueType: "number",
            htmlControl: "number",
            required: true,
          },
        ],
      }}
    />,
  );
  await user.type(screen.getByLabelText("Amount"), "-12.5");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/submit/s",
      expect.objectContaining({ body: JSON.stringify({ amount: -12.5 }) }),
    ),
  );
});

test("explains validation failures and keeps errors until the value is valid", async () => {
  const user = userEvent.setup();
  render(<SourcePage page={{ ...page, preview: true }} />);
  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByText("This field is required.")).toBeVisible();
  await user.type(screen.getByLabelText("Email"), "invalid");
  expect(screen.getByText("Enter a valid email address.")).toBeVisible();
  expect(screen.getByLabelText("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await user.type(screen.getByLabelText("Email"), "@example.test");
  expect(
    screen.queryByText("Enter a valid email address."),
  ).not.toBeInTheDocument();
});

const savedSession = {
  status: "draft",
  payload: { name: "Saved", email: "saved@example.test" },
  revision: 3,
  meta: { currentPage: 3, sessionUpdateCount: 3, sessionRequestCount: 5 },
  expiresAt: "2027-01-01",
  submissionId: null,
};
const response = (session = savedSession) => ({
  ok: true,
  json: async () => session,
});
function invitation() {
  window.history.replaceState(
    null,
    "",
    `/?who=Untrusted#session=${"a".repeat(43)}`,
  );
}

test.each([429, 500, 403, 400, 0])(
  "failed resume (%s) cannot expose a fresh form or open a new session",
  async (status) => {
    invitation();
    const fetch = status
      ? vi
          .fn()
          .mockResolvedValue({
            ok: false,
            status,
            headers: new Headers({ "retry-after": "1" }),
          })
      : vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
    expect(
      await screen.findByRole("button", { name: "Retry loading" }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.every(
        (call) => JSON.parse(call[1].body).operation === "read",
      ),
    ).toBe(true);
  },
);

test("retries loading without asking to discard nonexistent local answers", async () => {
  invitation();
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(response());
  vi.stubGlobal("fetch", fetch);
  const confirm = vi.spyOn(window, "confirm");
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  await user.click(
    await screen.findByRole("button", { name: "Retry loading" }),
  );
  expect(await screen.findByLabelText("Email")).toHaveValue(
    "saved@example.test",
  );
  expect(screen.getByRole("heading")).toHaveTextContent("Saved");
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
});

test("development effect replay issues one resume request", async () => {
  const { StrictMode } = await import("react");
  invitation();
  const fetch = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", fetch);
  render(
    <StrictMode>
      <SourcePage page={{ ...page, sessionsEnabled: true }} />
    </StrictMode>,
  );
  expect(await screen.findByLabelText("Email")).toHaveValue(
    "saved@example.test",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("navigation saves incomplete answers on Back and removes stale saved feedback after editing", async () => {
  invitation();
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockImplementation(async (_url, init) =>
      response({
        ...savedSession,
        payload: JSON.parse(init.body).payload,
        meta: { ...savedSession.meta, currentPage: 1 },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  await user.clear(await screen.findByLabelText("Email"));
  expect(screen.queryByText("Progress saved.")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save progress" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Back" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Name")).toHaveValue("Saved"),
  );
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    operation: "update",
    revision: 3,
    currentPage: 1,
    final: false,
    payload: { name: "Saved" },
  });
  expect(JSON.parse(fetch.mock.calls[1][1].body).payload).not.toHaveProperty(
    "email",
  );
});

test.each([401, 404, 410])(
  "unavailable session (%s) never becomes an editable form",
  async (status) => {
    invitation();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
    render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
    await screen.findByText(
      status === 410
        ? "This session has expired. It cannot be reopened."
        : "This session is unavailable.",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
  },
);

test("completed resume stays completed and unknown saved steps fall back only after a successful read", async () => {
  invitation();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      response({
        ...savedSession,
        status: "completed",
        meta: { ...savedSession.meta, currentPage: 99 },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  expect(
    await screen.findByText("The response has been submitted."),
  ).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  cleanup();
  fetch.mockResolvedValue(
    response({
      ...savedSession,
      meta: { ...savedSession.meta, currentPage: 99 },
    }),
  );
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  expect(await screen.findByLabelText("Name")).toHaveValue("Saved");
});

test("a conflict preserves local answers until explicitly loading the server version", async () => {
  invitation();
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce({ ok: false, status: 409 })
    .mockResolvedValue(response());
  vi.stubGlobal("fetch", fetch);
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  await user.clear(await screen.findByLabelText("Email"));
  await user.type(screen.getByLabelText("Email"), "local@example.test");
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(
    await screen.findByRole("button", { name: "Load saved version" }),
  );
  expect(screen.getByLabelText("Email")).toHaveValue("local@example.test");
  expect(fetch).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "Load saved version" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Email")).toHaveValue("saved@example.test"),
  );
  confirm.mockRestore();
});

test("lost final response retries the same final operation", async () => {
  invitation();
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockRejectedValueOnce(new Error("lost final response"))
    .mockResolvedValue(response({ ...savedSession, status: "completed" }));
  vi.stubGlobal("fetch", fetch);
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  await screen.findByLabelText("Email");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await user.click(await screen.findByRole("button", { name: "Retry save" }));
  await screen.findByText("The response has been submitted.");
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
  expect(JSON.parse(fetch.mock.calls[2][1].body).final).toBe(true);
});

test("disabling sessions cannot turn an existing invitation into a one-shot form", async () => {
  invitation();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<SourcePage page={{ ...page, sessionsEnabled: false }} />);
  expect(await screen.findByText("This session is unavailable.")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["", "invalid"])(
  "a malformed invitation (%s) cannot start a new session",
  async (key) => {
    window.history.replaceState(null, "", `/#session=${key}`);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
    await screen.findByText("This session is unavailable.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  },
);

test("progress labels the current step and its percentage", async () => {
  const user = userEvent.setup();
  render(
    <SourcePage
      page={{
        ...page,
        preview: true,
        sessionsEnabled: true,
        presentation: {
          steps: [
            { id: 1, title: "About you" },
            { id: 3, title: "Contact" },
          ],
        },
      }}
    />,
  );
  expect(screen.getByRole("progressbar")).toHaveAccessibleName("About you");
  expect(screen.getByText("50%")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("progressbar")).toHaveAccessibleName("Contact");
  expect(screen.getByText("100%")).toBeVisible();
});

test("multi-step forms explain saving in English using the configured final button label", () => {
  render(
    <SourcePage
      page={{
        ...page,
        preview: true,
        sessionsEnabled: true,
        presentation: {
          ...page.presentation,
          language: "en",
          systemTexts: { submit: "Send answers" },
        },
      }}
    />,
  );
  expect(screen.getByRole("note")).toHaveTextContent(
    "Answers are saved when moving between steps. Complete the form by clicking Send answers in the last step.",
  );
  expect(screen.queryByText("Progress saved.")).not.toBeInTheDocument();
  cleanup();
  render(
    <SourcePage
      page={{
        ...page,
        preview: true,
        sessionsEnabled: true,
        fields: [page.fields[0]],
      }}
    />,
  );
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});

test.each([false, true])("no copy action before a session exists (sessions: %s)", (sessionsEnabled) => {
  render(<SourcePage page={{ ...page, sessionsEnabled }} />);
  expect(screen.queryByRole("button", { name: /Copy/ })).not.toBeInTheDocument();
});

test("preview does not offer a resume link even with a session fragment", () => {
  invitation();
  render(<SourcePage page={{ ...page, sessionsEnabled: true, preview: true }} />);
  expect(screen.queryByRole("button", { name: /Copy/ })).not.toBeInTheDocument();
});

test("Copy link copies the resumed session capability", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  invitation();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  render(<SourcePage page={{ ...page, sessionsEnabled: true }} />);
  await screen.findByLabelText("Email");
  await user.click(screen.getByRole("button", { name: "Copy resume link" }));
  expect(copy).toHaveBeenCalledWith(window.location.href);
  expect(copy.mock.calls.at(-1)?.[0]).toContain("#session=");
});

test("schema validation blocks submission independently of the email control and explains integer errors", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(
    <SourcePage
      page={{
        ...page,
        sourceSchema: JSON.stringify({
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            count: { type: "integer" },
          },
          required: ["email", "count"],
          additionalProperties: false,
        }),
        fields: [
          {
            name: "email",
            label: "Email",
            page: 1,
            valueType: "string",
            htmlControl: "textarea",
            required: true,
          },
          {
            name: "count",
            label: "Count",
            page: 1,
            valueType: "number",
            htmlControl: "number",
            required: true,
          },
        ],
      }}
    />,
  );
  await user.type(screen.getByLabelText("Email"), "bad");
  await user.type(screen.getByLabelText("Count"), "2.5");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByText("Enter a valid email address.")).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus());
  expect(fetch).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Email"));
  await user.type(screen.getByLabelText("Email"), "a@example.test");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByText("Enter a whole number.")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Count"));
  await user.type(screen.getByLabelText("Count"), "2");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
});

test("keeps unfinished JSON editable, rejects it, and submits a typed array", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(
    <SourcePage
      page={{
        ...page,
        fields: [
          {
            name: "topics",
            label: "Topics",
            page: 1,
            valueType: "array",
            htmlControl: "textarea",
            required: false,
          },
        ],
        sourceSchema: JSON.stringify({
          type: "object",
          properties: {
            topics: { type: "array", items: { type: "string" }, minItems: 2 },
          },
          additionalProperties: false,
        }),
      }}
    />,
  );
  const input = screen.getByLabelText(/Topics/);
  fireEvent.change(input, { target: { value: '["forms"' } });
  expect(input).toHaveValue('["forms"');
  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(input).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(input, { target: { value: '["forms","surveys"]' } });
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/submit/s",
      expect.objectContaining({
        body: JSON.stringify({ topics: ["forms", "surveys"] }),
      }),
    ),
  );
});

test.each([false, true])(
  "missing CAPTCHA prevents page request (session %s)",
  async (sessionsEnabled) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(
      <SourcePage
        page={{
          ...page,
          challengeUrl: "https://forman.test/api/challenge/s",
          altchaEnabled: true,
          sessionsEnabled,
          fields: [page.fields[0]],
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Default");
  },
);

test.each([false, true])(
  "multiple traps and rejected verification preserve page answers (session %s)",
  async (sessionsEnabled) => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    const { container } = render(
      <SourcePage
        page={{
          ...page,
          challengeUrl: "https://forman.test/api/challenge/s",
          altchaEnabled: true,
          honeypotEnabled: true,
          honeypotFieldNames: ["company", "website"],
          sessionsEnabled,
          fields: [page.fields[0]],
        }}
      />,
    );
    const form = container.querySelector("form")!;
    const proof = document.createElement("input");
    proof.name = "altcha";
    proof.value = "expired-proof";
    form.append(proof);
    const reset = vi.fn(() => {
      proof.value = "";
    });
    Object.assign(container.querySelector("altcha-widget")!, { reset });
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(reset).toHaveBeenCalled());
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sessionsEnabled ? body.protection.honeypot : body).toMatchObject({
      company: "",
      website: "",
    });
    expect(screen.getByLabelText("Name")).toHaveValue("Default");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test.each(["missing", "duplicate", "filled"])(
  "page blocks a %s trap",
  async (mode) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    const { container } = render(
      <SourcePage
        page={{
          ...page,
          honeypotEnabled: true,
          honeypotFieldNames: ["company", "website"],
          fields: [page.fields[0]],
        }}
      />,
    );
    const trap = container.querySelector<HTMLInputElement>(
      'input[name="website"]',
    )!;
    if (mode === "missing") trap.remove();
    else if (mode === "duplicate") trap.after(trap.cloneNode());
    else trap.value = " ";
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(fetcher).not.toHaveBeenCalled();
  },
);

test("clears only the verification notice when ALTCHA becomes verified", async () => {
  const view = render(<SourcePage page={{...page, altchaEnabled: true, challengeUrl: "https://forman.test/api/challenge/s"}} />);
  fireEvent.change(screen.getByLabelText("Email"), {target: {value: "qa@example.test"}});
  fireEvent.click(screen.getByRole("button", {name: "Submit"}));
  expect(await screen.findByText("Complete the verification before saving.")).toBeVisible();
  const widget = view.container.querySelector("altcha-widget")!;
  fireEvent(widget, new CustomEvent("statechange", {detail: {state: "verified"}}));
  expect(screen.queryByText("Complete the verification before saving.")).not.toBeInTheDocument();
});
