import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import * as sourceApi from "@/client/admin-api/sources";
import { AdminApiError } from "@/client/admin-api/client";
import type { AdminSourceDetailResponse } from "@/shared/contracts/admin";

const { go, saveSourceSettingsSection, toastSuccess } = vi.hoisted(() => ({
  go: vi.fn(),
  saveSourceSettingsSection: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/client/admin-api/source-sessions", () => ({
  listSourceSessions: async () => ({
    settings: {
      enabled: false,
      inactivityDays: 30,
      completedRetentionDays: 30,
    },
    items: [],
    total: 0,
    page: 1,
    size: 25,
  }),
}));
vi.mock("@/client/admin-api/sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client/admin-api/sources")>()),
  saveSourceSettingsSection,
}));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => (
    <a href={href} {...properties}>
      {children}
    </a>
  ),
  useAppNavigation: () => ({ go, refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

import { SourceDetailScreen } from "@/components/sources/source-detail-screen";

const sourceDetail: AdminSourceDetailResponse = {
  pipelines: [], pageCount: 0,
  source: {
    type: "one-shot",
    allowedOrigins: [],
    altchaEnabled: true,
    challengeRateLimitPerMinute: null,
    createdAt: "2026-08-13T09:00:00.000Z",
    enabled: true,
    sourceId: "contact-form",
    honeypotEnabled: true,
    honeypotFieldNames: ["work_extension"],
    id: "form-1",
    maxBodyBytes: 65_536,
    maxEntries: 50,
    maxKeyLength: 100,
    maxUniqueKeys: 30,
    maxValueLength: 10_000,
    maxValuesPerKey: 20,
    name: "Contact",
    retentionDays: null,
    serverTokenPrefix: "abc",
    storeReferer: false,
    storeUserAgent: false,
    submissionRateLimitPerMinute: null,
    successUrl: null,
    tags: [],
    updatedAt: "2026-08-13T09:00:00.000Z",
  },
  integration: {
    examplesAvailable: true,
    sourceType: "one-shot",
    endpoints: {
      submission: "https://test/submit",
      challenge: "https://test/challenge",
    },
    sessionJavaScript: null,
    sessionReactJsx: null,
    warnings: [],
    browserHtml:
      '<form action="https://forman.test/api/submit/contact-form"></form>',
    browserJavaScript: "await fetch('/api/submit/contact-form')",
    reactJsx: "export function ContactForm() {}",
    m2mCurl: "curl --request POST https://forman.test/api/m2m/contact-form",
    popupSource:
      '<script src="https://forman.test/public/pop-up-v1.js" defer></script>',
  },
  observedFieldNames: ["email"],
  submissionCount: 2,
  sessionSettings: {
    enabled: false,
    inactivityDays: 30,
    completedRetentionDays: 30,
  },
};

function renderSourceDetail(
  properties: Partial<React.ComponentProps<typeof SourceDetailScreen>> = {},
) {
  return render(
    <SourceDetailScreen
      loadSource={async () => sourceDetail}
      sourceId="contact-form"
      {...properties}
    />,
  );
}

function sourceResponse(overrides: Partial<typeof sourceDetail.source>) {
  return { ...sourceDetail, source: { ...sourceDetail.source, ...overrides } };
}

async function openConfiguration(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole("tab", {
    name: "Configuration",
  });
  if (trigger.getAttribute("aria-selected") !== "true")
    await user.click(trigger);
}

async function changeNameAndSave(name = "Updated contact") {
  const user = userEvent.setup();
  await openConfiguration(user);
  await user.clear(screen.getByLabelText(/^Name/));
  await user.type(
    screen.getByLabelText(/^Name/),
    name,
  );
  await user.click(screen.getByRole("button", { name: "Save configuration" }));
}

describe("SourceDetailScreen", () => {
  test("keeps the populated Source draft visible with a retry warning until refresh recovery", async () => {
    const user = userEvent.setup();
    const loadSource = vi
      .fn()
      .mockResolvedValueOnce(sourceDetail)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        sourceResponse({
          name: "Server contact",
          updatedAt: "2026-09-05T12:00:00Z",
        }),
      );
    renderSourceDetail({ loadSource });
    await openConfiguration(user);
    const name = screen.getByLabelText(/^Name/);
    fireEvent.change(name, { target: { value: "Draft contact" } });
    await act(async () => window.dispatchEvent(new Event("focus")));
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("Showing data from");
    expect(name).toHaveValue("Draft contact");
    await user.click(
      within(warning).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Couldn.t refresh this page/),
      ).not.toBeInTheDocument(),
    );
    expect(name).toHaveValue("Draft contact");
    await user.click(
      screen.getByRole("button", { name: "Reload and discard changes" }),
    );
    expect(
      screen.getByLabelText(/^Name/),
    ).toHaveValue("Server contact");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    delete (window as Window & { forman?: unknown }).forman;
    vi.clearAllMocks();
  });

  test("uses the Source identity in a breadcrumb-free header with a collection return action", async () => {
    const user = userEvent.setup();
    const setSourceState = vi.fn().mockResolvedValue(sourceDetail.source);
    renderSourceDetail({ setSourceState });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Contact" }),
    ).toBeInTheDocument();
    expect(screen.getByText("One-shot · ID: contact-form")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to all Sources" }),
    ).toHaveAttribute("href", "/app/sources");

    await user.click(screen.getByLabelText("Source actions", { exact: false }));
    await user.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    expect(setSourceState).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Deactivate Source?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(setSourceState).toHaveBeenCalledWith("contact-form", false);
    expect(toastSuccess).toHaveBeenCalledWith("Source deactivated");
  });

  test("renders semantic integration code and browser protections after opening their panels", async () => {
    const user = userEvent.setup();
    renderSourceDetail();

    await user.click(await screen.findByRole("tab", { name: /Protection/ }));
    await user.click(screen.getByRole("tab", { name: /Integration/ }));

    await waitFor(() => expect(screen.getByLabelText("Example")).toBeVisible());
    expect(
      within(screen.getByRole("tabpanel")).queryByRole("tab"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy integration guide" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send test Submission" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Enable ALTCHA", { exact: false }),
    ).toBeChecked();
    expect(
      screen.getByLabelText("Enable honeypot", { exact: false }),
    ).toBeChecked();
  });

  test("saves comma-separated honeypot fields with whitespace removed", async () => {
    const user = userEvent.setup();
    saveSourceSettingsSection.mockResolvedValueOnce({
      ...sourceDetail.source,
      honeypotFieldNames: ["website", "phone"],
    });
    renderSourceDetail();
    await user.click(await screen.findByRole("tab", { name: /Protection/ }));
    const names = screen.getByLabelText("Honeypot field names", {
      exact: false,
    });
    await waitFor(() => expect(names).toBeVisible());
    expect(names).toHaveValue("work_extension");
    fireEvent.change(names, { target: { value: " web site , phone " } });
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    expect(saveSourceSettingsSection).toHaveBeenCalledWith(
      "contact-form",
      "protection",
      expect.objectContaining({ honeypotFieldNames: ["website", "phone"] }),
    );
  });

  test("asks for honeypot field names only while the honeypot is enabled", async () => {
    const user = userEvent.setup();
    renderSourceDetail();
    await user.click(await screen.findByRole("tab", { name: /Protection/ }));
    const names = screen.getByLabelText("Honeypot field names", {
      exact: false,
    });
    await waitFor(() => expect(names).toBeVisible());
    expect(names).toBeRequired();
    await user.click(screen.getByLabelText("Enable honeypot", { exact: false }));
    expect(names).not.toBeVisible();
    expect(names).not.toBeRequired();
    await user.click(screen.getByLabelText("Enable honeypot", { exact: false }));
    expect(names).toBeVisible();
  });

  test("places basic configuration before tags", async () => {
    renderSourceDetail();

    const triggers = await screen.findAllByRole("tab");
    expect(
      triggers.indexOf(screen.getByRole("tab", { name: /Tags/ })),
    ).toBeGreaterThan(
      triggers.indexOf(screen.getByRole("tab", { name: /Configuration/ })),
    );
  });

  test("opens basic configuration and keeps other tabs inactive", async () => {
    renderSourceDetail();

    const configuration = await screen.findByRole("tab", {
      name: /Configuration/,
    });
    expect(configuration).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Tags/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("places Integration examples after Source fields and before Pipelines", async () => {
    renderSourceDetail();

    const triggers = await screen.findAllByRole("tab");
    expect(
      triggers.indexOf(screen.getByRole("tab", { name: /Source fields/ })),
    ).toBeLessThan(
      triggers.indexOf(screen.getByRole("tab", { name: /Integration/ })),
    );
    expect(
      triggers.indexOf(screen.getByRole("tab", { name: /Integration/ })),
    ).toBeLessThan(
      triggers.indexOf(
        screen
          .getAllByRole("tab", { name: /Pipelines/ })
          .find((trigger) => trigger.textContent?.startsWith("Pipelines"))!,
      ),
    );
  });

  test("uses defined form fields when opening the integration test popup", async () => {
    const user = userEvent.setup();
    const forman = vi.fn().mockResolvedValue({ destroy: vi.fn() });
    (window as Window & { forman?: typeof forman }).forman = forman;
    renderSourceDetail({
      loadSource: async () =>
        sourceResponse({
          fieldDefinitionMode: "json-schema",
          fieldDefinitionSource:
            '{"type":"object","properties":{"email":{"type":"string","format":"email","minLength":5,"maxLength":254},"name":{"type":"string","maxLength":120},"note":{"type":"string","maxLength":1000}},"required":["email"],"additionalProperties":false}',
        }),
    });

    await user.click(await screen.findByRole("tab", { name: /Integration/ }));
    await user.selectOptions(screen.getByLabelText("Example"), "Popup");
    await user.click(screen.getByRole("button", { name: "Preview popup" }));

    expect(forman).toHaveBeenCalledWith(
      "create",
      expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({ name: "email" }),
          expect.objectContaining({ name: "name" }),
          expect.objectContaining({ name: "note" }),
        ]),
      }),
    );
    expect(forman.mock.calls[0]?.[1]).not.toEqual(
      expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({ name: "message" }),
        ]),
      }),
    );
  });

  test("offers access to this Source's Pipelines and Submissions from the Source action menu", async () => {
    const user = userEvent.setup();
    renderSourceDetail({ loadSource: async () => ({ ...sourceDetail, pipelines: [{ id: "flow-1", name: "Flow", enabled: true, steps: [] }] }) });

    await user.click(
      await screen.findByRole("button", { name: "Source actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "View Pipelines" }),
    ).toHaveAttribute("href", "/app/pipelines?sourceId=form-1");
    expect(
      screen.getByRole("menuitem", { name: "View Submissions" }),
    ).toHaveAttribute("href", "/app/submissions?sourceId=form-1");
  });

  test("uses singular Action copy for one attached Pipeline Action", async () => {
    const user = userEvent.setup();
    renderSourceDetail({
      loadSource: async () => ({
        ...sourceDetail,
        pipelines: [
          {
            enabled: true,
            id: "flow-1",
            name: "Normalize contact",
            steps: [{ enabled: true }],
          },
        ],
      }),
    });

    await user.click(
      (await screen.findAllByRole("tab", { name: /Pipelines/ })).find(
        (trigger) => trigger.textContent?.startsWith("Pipelines"),
      )!,
    );

    expect(screen.getByText("1 Action")).toBeVisible();
    expect(screen.queryByText("1 Actions")).not.toBeInTheDocument();
  });

  test("restores the initial basic configuration after leaving the page", async () => {
    const user = userEvent.setup();
    renderSourceDetail();

    const configurationTrigger = await screen.findByRole("tab", {
      name: /Configuration/,
    });
    expect(configurationTrigger).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Protection" }));
    expect(configurationTrigger).toHaveAttribute("aria-selected", "false");
    cleanup();
    // Leaving the page navigates to a URL without the section hash.
    window.history.replaceState(null, "", window.location.pathname);

    renderSourceDetail();
    expect(
      await screen.findByRole("tab", { name: /Configuration/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("offers JSON Schema without a format selector", async () => {
    const user = userEvent.setup();
    renderSourceDetail();

    await user.click(await screen.findByRole("tab", { name: /Source fields/ }));

    expect(
      screen.queryByLabelText("Source fields format", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Definition (JSON Schema)", { exact: false }),
    ).toHaveValue("");
  });

  test("keeps destructive confirmation explicit about captured submissions", async () => {
    const user = userEvent.setup();
    renderSourceDetail({
      loadSource: async () => sourceResponse({ enabled: false }),
    });

    await user.click(await screen.findByLabelText("Source actions"));
    await user.click(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Delete Source?",
    });
    expect(dialog).toHaveTextContent(
      "Permanently deletes the Source and its 2 stored Submissions.",
    );
    expect(dialog).toHaveTextContent(
      "Permanently deletes",
    );
  });

  test("shows configuration feedback when the portable update fails", async () => {
    saveSourceSettingsSection.mockRejectedValueOnce(
      new Error("invalid configuration"),
    );
    renderSourceDetail();
    await changeNameAndSave();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Review the Source settings",
    );
  });

  test("keeps the save action in place and enables it only for changes", async () => {
    const user = userEvent.setup();
    renderSourceDetail();

    await openConfiguration(user);
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeDisabled();

    const name = screen.getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Different contact");
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, sourceDetail.source.name);
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeDisabled();
  });

  test("classifies a 409 configuration response as a friendly-name conflict regardless of its wording", async () => {
    saveSourceSettingsSection.mockRejectedValueOnce(
      new AdminApiError(409, "translated response"),
    );
    renderSourceDetail();
    await changeNameAndSave();
    expect(
      await screen.findByText(
        "Choose a unique Source name.",
      ),
    ).toBeInTheDocument();
  });

  test("shows the Source lifecycle status beside the Source name without a state accordion", async () => {
    renderSourceDetail();
    await screen.findByRole("heading", { level: 1, name: "Contact" });
    expect(screen.getByText("Active")).toBeInTheDocument();

    cleanup();
    renderSourceDetail({
      loadSource: async () => sourceResponse({ enabled: false }),
    });

    await screen.findByRole("heading", { level: 1, name: "Contact" });
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Inactive Sources cannot receive Submissions.",
    );
  });

  test("keeps Source state errors out of the fixed page header", async () => {
    const user = userEvent.setup();
    renderSourceDetail({
      setSourceState: async () => {
        throw new Error("offline");
      },
    });

    await user.click(await screen.findByLabelText("Source actions"));
    await user.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(
      "The Source state could not be updated. Try again.",
    );
    expect(
      document.querySelector('[data-slot="page-header"]'),
    ).not.toHaveTextContent("The Source state could not be updated.");
  });

  test("sends the complete configuration-section payload through the production PATCH path", async () => {
    saveSourceSettingsSection.mockResolvedValueOnce({
      ...sourceDetail.source,
      name: "Updated contact",
    });
    renderSourceDetail();
    await changeNameAndSave();

    expect(saveSourceSettingsSection).toHaveBeenCalledWith(
      "contact-form",
      "configuration",
      {
        name: "Updated contact",
        successUrl: null,
      },
    );
    expect(toastSuccess).toHaveBeenCalledWith("Source settings saved");
  });

  test("templates edit a draft, confirm replacement and follow saved Sessions", async () => {
    const user = userEvent.setup();
    renderSourceDetail();
    await user.click(
      await screen.findByRole("tab", { name: /^Source fields/ }),
    );
    expect(
      screen.queryByRole("option", { name: "Simple survey" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Email only" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Name, email and organization" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Registration" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Templates", { exact: false }),
      "name-email",
    );
    const definition = screen.getByLabelText("Definition (JSON Schema)", {
      exact: false,
    });
    expect(
      JSON.parse((definition as HTMLTextAreaElement).value).required,
    ).toEqual(["name", "email"]);
    expect(saveSourceSettingsSection).not.toHaveBeenCalled();
    await user.clear(definition);
    await user.type(definition, "draft");
    await user.selectOptions(
      screen.getByLabelText("Templates", { exact: false }),
      "name-email",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(definition).toHaveValue("draft");
    await user.selectOptions(
      screen.getByLabelText("Templates", { exact: false }),
      "name-email",
    );
    await user.click(
      screen.getByRole("button", { name: "Replace definition" }),
    );
    expect((definition as HTMLTextAreaElement).value).toContain('"email"');
    await user.click(
      screen.getByRole("button", { name: "Save Source fields" }),
    );
    await waitFor(() => expect(saveSourceSettingsSection).toHaveBeenCalled());
  });

  test("saved Sessions make the survey template available", async () => {
    const user = userEvent.setup();
    renderSourceDetail({
      loadSource: async () => ({
        ...sourceDetail,
        source: { ...sourceDetail.source, type: "session" },
        sessionSettings: { ...sourceDetail.sessionSettings, enabled: true },
        integration: { ...sourceDetail.integration, sourceType: "session" },
      }),
    });
    await user.click(
      await screen.findByRole("tab", { name: /^Source fields/ }),
    );
    await user.selectOptions(
      screen.getByLabelText("Templates", { exact: false }),
      "survey",
    );
    expect(
      JSON.parse(
        (
          screen.getByLabelText("Definition (JSON Schema)", {
            exact: false,
          }) as HTMLTextAreaElement
        ).value,
      ).properties.rating,
    ).toEqual({ type: "integer", minimum: 1, maximum: 5 });
  });

  test("advanced saves do not include basic draft fields", async () => {
    const user = userEvent.setup();
    renderSourceDetail({
      loadSource: async () => sourceResponse({ type: "session" }),
    });
    await openConfiguration(user);
    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(
      screen.getByLabelText(/^Name/),
      "Unsaved name",
    );
    await user.click(screen.getByRole("tab", { name: /^Advanced/ }));
    await user.clear(
      screen.getByLabelText("Expire after inactivity (days)", { exact: false }),
    );
    await user.type(
      screen.getByLabelText("Expire after inactivity (days)", { exact: false }),
      "14",
    );
    await user.click(
      screen.getByRole("button", { name: "Save advanced configuration" }),
    );
    await waitFor(() =>
      expect(saveSourceSettingsSection).toHaveBeenCalledWith(
        "contact-form",
        "advanced",
        expect.objectContaining({
          sessionInactivityDays: 14,
          sessionCompletedRetentionDays: 30,
        }),
      ),
    );
    expect(saveSourceSettingsSection.mock.calls[0][2]).not.toHaveProperty(
      "name",
    );
    expect(saveSourceSettingsSection.mock.calls[0][2]).not.toHaveProperty(
      "sessionEnabled",
    );
    expect(
      screen.getByLabelText(/^Name/),
    ).toHaveValue("Unsaved name");
    await user.click(screen.getByRole("tab", { name: "Configuration" }));
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeVisible();
  });

  test.each(["one-shot", "session", "m2m"] as const)(
    "shows immutable %s type and relevant settings only",
    async (type) => {
      const user = userEvent.setup();
      renderSourceDetail({ loadSource: async () => sourceResponse({ type }) });
      await openConfiguration(user);
      expect(
        screen.getByText(new RegExp(`${type === "session" ? "Session" : type === "m2m" ? "M2M" : "One-shot"} · ID:`)),
      ).toBeVisible();
      expect(screen.queryByText("Source type cannot be changed.")).not.toBeInTheDocument();
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Success URL", { exact: false }) !== null,
      ).toBe(type !== "m2m");
      await user.click(screen.getByRole("tab", { name: /^Advanced/ }));
      expect(
        screen.queryByLabelText("Expire after inactivity (days)", {
          exact: false,
        }) !== null,
      ).toBe(type === "session");
      expect(
        screen.queryByLabelText("Challenge rate limit (per minute)", {
          exact: false,
        }) !== null,
      ).toBe(type !== "m2m");
      await user.click(screen.getByRole("tab", { name: "Protection" }));
      expect(
        screen.queryByLabelText("Enable ALTCHA", { exact: false }) !== null,
      ).toBe(type !== "m2m");
      expect(screen.queryByText("M2M protection (bearer token)") !== null).toBe(
        type === "m2m",
      );
      await user.click(screen.getByRole("tab", { name: "Configuration" }));
      await user.clear(
        screen.getByLabelText(/^Name/),
      );
      await user.type(
        screen.getByLabelText(/^Name/),
        "Changed name",
      );
      await user.click(
        screen.getByRole("button", { name: "Save configuration" }),
      );
      await waitFor(() =>
        expect(saveSourceSettingsSection).toHaveBeenCalledWith(
          "contact-form",
          "configuration",
          type === "m2m"
            ? { name: "Changed name" }
            : { name: "Changed name", successUrl: null },
        ),
      );
    },
  );
});

describe("section lifecycle regressions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.history.replaceState(null, "", window.location.pathname);
  });

  test("keeps saved tag selections when a visited tab is hidden", async () => {
    const user = userEvent.setup();
    const list = vi
      .spyOn(sourceApi, "listTags")
      .mockResolvedValue([{ id: "sales", name: "Sales", color: "blue" }]);
    saveSourceSettingsSection.mockReset().mockResolvedValue({});
    renderSourceDetail();
    const tags = await screen.findByRole("tab", { name: "Tags" });
    await user.click(tags);
    await user.click(await screen.findByRole("button", { name: "Sales" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sales" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.click(screen.getByRole("tab", { name: "Configuration" }));
    expect(screen.getByText("Sales")).not.toBeVisible();
    await user.click(tags);
    expect(
      await screen.findByRole("button", { name: "Sales" }),
    ).toHaveAttribute("aria-pressed", "true");
    list.mockRestore();
  });

  test("reveals a late save failure after the edited another tab was selected", async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    saveSourceSettingsSection.mockReturnValueOnce(
      new Promise((_, no) => {
        reject = no;
      }),
    );
    renderSourceDetail();
    await openConfiguration(user);
    await user.type(
      screen.getByLabelText(/^Name/),
      " edited",
    );
    await user.click(
      screen.getByRole("button", { name: "Save configuration" }),
    );
    const trigger = screen.getByRole("tab", { name: "Configuration" });
    await user.click(screen.getByRole("tab", { name: "Protection" }));
    expect(trigger).toHaveAttribute("aria-selected", "false");
    await act(async () => reject(new AdminApiError(422, "Invalid settings")));
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Review the Source settings",
    );
  });

  test("opens the Source section addressed by a deep link", async () => {
    window.history.replaceState(null, "", "#advanced-configuration");
    renderSourceDetail();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    window.history.replaceState(null, "", window.location.pathname);
  });
  test("explains HTTPS validation and clears it when the Success URL is reverted", async () => {
    render(<SourceDetailScreen sourceId="contact-form" loadSource={async () => sourceDetail} />);
    const url = await screen.findByLabelText("Success URL");
    fireEvent.change(url, {target: {value: "http://example.test/success"}});
    fireEvent.click(screen.getByRole("button", {name: "Save configuration"}));
    expect(await screen.findByText("Use HTTPS (or HTTP on localhost), or leave this field empty.")).toBeVisible();
    fireEvent.change(url, {target: {value: ""}});
    expect(screen.queryByText("Use HTTPS (or HTTP on localhost), or leave this field empty.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save configuration"})).toBeDisabled();
  });

});

test("Source deletion failure stays inside its confirmation dialog",async()=>{const user=userEvent.setup();renderSourceDetail({loadSource:async()=>({...sourceDetail,source:{...sourceDetail.source,enabled:false}}),deleteSource:async()=>{throw Error("offline");}});await user.click(await screen.findByLabelText("Source actions"));await user.click(screen.getByRole("menuitem",{name:"Delete permanently"}));const dialog=screen.getByRole("dialog");await user.click(within(dialog).getByRole("button",{name:"Delete permanently"}));expect(await within(dialog).findByRole("alert")).toHaveTextContent("could not be deleted");cleanup();});
