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

import { SettingsScreen } from "@/components/settings/settings-screen";

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: toastSuccess } }));
import type { AdminSettings } from "@/shared/contracts/admin";

const settings: AdminSettings = {
  altchaMaxNumber: 10_000,
  challengeRateLimitPerMinute: 30,
  challengeTtlSeconds: 300,
  clientBurstLimit: 15,
  clientRateLimitPerMinute: 60,
  sourceRateLimitPerMinute: 120,
  formspreeCompatibilityEndpointEnabled: false,
  failedActionRetentionDays: 30,
  inboxRetentionDays: 365,
  adminSessionIdleDays: 7,
  adminSessionAbsoluteDays: 30,
  loginFailureLimit: 5,
  loginFailureWindowSeconds: 900,
  rateLimiterCapacity: 500,
  rateLimiterTtlSeconds: 600,
  robotsTxt: "User-agent: *\nDisallow: /\n",
  submissionRateLimitPerMinute: 5,
  smtp: {
    from: null,
    host: null,
    passwordConfigured: false,
    port: null,
    encryption: "starttls",
    status: "not-configured",
    username: null,
  },
  updatedAt: "2026-08-13T10:00:00.000Z",
  webhookSsrfProtectionEnabled: true,
};

function renderSettings(
  properties: Partial<React.ComponentProps<typeof SettingsScreen>> = {},
) {
  return render(
    <SettingsScreen loadSettings={async () => settings} {...properties} />,
  );
}

describe("SettingsScreen", () => {
  test("preserves an unsaved section through failed refresh and recovery", async () => {
    const user = userEvent.setup();
    const loadSettings = vi
      .fn()
      .mockResolvedValueOnce(settings)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ...settings,
        failedActionRetentionDays: 90,
        updatedAt: "2026-09-05T12:00:00Z",
      });
    renderSettings({ loadSettings });
    await user.click(
      await screen.findByRole("tab", { name: /^Misc$/ }),
    );
    const retention = screen.getByLabelText("Failed Action retention (days)");
    fireEvent.change(retention, { target: { value: "45" } });
    await act(async () => window.dispatchEvent(new Event("focus")));
    const warning = await screen.findByRole("alert");
    expect(retention).toHaveValue(45);
    await user.click(
      within(warning).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Couldn.t refresh this page/),
      ).not.toBeInTheDocument(),
    );
    expect(retention).toHaveValue(45);
    expect(screen.getByText("Newer data is available.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Reload and discard changes" }),
    );
    expect(retention).toHaveValue(90);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  test("loads misc settings and saves them through the injected client", async () => {
    const user = userEvent.setup();
    const saveSettings = vi.fn().mockResolvedValue(settings);

    renderSettings({ saveSettings });

    await user.click(
      await screen.findByRole("tab", { name: /^Misc$/ }),
    );

    expect(
      screen.getByLabelText("Failed Action retention (days)"),
    ).toBeVisible();
    expect(screen.getByLabelText("Inbox retention (days)")).toBeVisible();
    await user.click(
      screen.getByRole("checkbox", {
        name: /Enable Submission endpoint alias/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save misc settings" }),
    );

    expect(saveSettings).toHaveBeenCalledWith({
      failedActionRetentionDays: 30,
      formspreeCompatibilityEndpointEnabled: true,
      inboxRetentionDays: 365,
    });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Misc settings saved."),
    );
  });

  test("starts on Account again after leaving the page", async () => {
    const user = userEvent.setup();
    renderSettings();

    const protectionTrigger = await screen.findByRole("tab", {
      name: /^Protection$/,
    });
    expect(protectionTrigger).toHaveAttribute("aria-selected", "false");

    await user.click(protectionTrigger);
    expect(protectionTrigger).toHaveAttribute("aria-selected", "true");
    cleanup();
    // Leaving the page navigates to a URL without the section hash.
    window.history.replaceState(null, "", window.location.pathname);

    renderSettings();

    expect(
      await screen.findByRole("tab", { name: /^Protection$/ }),
    ).toHaveAttribute("aria-selected", "false");
  });

  test("uses a concise Tags section heading", async () => {
    renderSettings();

    expect(await screen.findByRole("tab", { name: /Tags/ })).toHaveTextContent(
      "Tags",
    );
  });

  test("places backup and restore after SMTP and before Robots", async () => {
    renderSettings();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Account",
      "Tags",
      "Protection",
      "SMTP",
      "Backup and restore",
      "Robots",
      "Misc",
    ]);
  });

  test("preserves an unsaved draft while switching categories", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(
      await screen.findByRole("tab", { name: "Misc" }),
    );
    const input = screen.getByLabelText("Failed Action retention (days)");
    fireEvent.change(input, { target: { value: "47" } });
    await user.click(screen.getByRole("tab", { name: "Protection" }));
    expect(input).not.toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Misc" }));
    expect(screen.getByLabelText("Failed Action retention (days)")).toBe(input);
    expect(input).toHaveValue(47);
  });

  test("automatically reveals password failure feedback next to its form", async () => {
    renderSettings({ passwordError: true });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Could not change password");
    expect(error.closest("fieldset")).toHaveTextContent(
      "Password",
    );
  });

  test("keeps an invalid protection update next to its form", async () => {
    const user = userEvent.setup();
    renderSettings({
      saveSettings: async () => {
        throw new Error("invalid");
      },
    });

    await user.click(
      await screen.findByRole("tab", { name: /^Protection$/ }),
    );
    await user.clear(screen.getByLabelText("Submission rate limit (per minute)"));
    await user.type(
      screen.getByLabelText("Submission rate limit (per minute)"),
      "6",
    );
    await user.click(
      within(screen.getByRole("group", { name: "Submission limits" })).getByRole("button", { name: "Save" }),
    );

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Could not save protection settings");
    expect(error.closest("fieldset")).toHaveTextContent("Submission limits");
  });

  test("explains a failed settings load and offers retry", async () => {
    const loadSettings = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(settings);
    const user = userEvent.setup();
    renderSettings({ loadSettings });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Settings could not be loaded",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await user.click(
      await screen.findByRole("tab", { name: /^Protection$/ }),
    );
    expect(
      await screen.findByLabelText("Submission rate limit (per minute)"),
    ).toHaveValue(5);
    expect(loadSettings).toHaveBeenCalledTimes(2);
  });
});

test("saves session limits from Account and rejects inverted limits", async () => {
  const saved = vi.fn(async (values) => ({ ...settings, ...values }));
  const user = userEvent.setup();
  renderSettings({ saveSettings: saved });
  await user.click(await screen.findByRole("tab", { name: /^Account/ }));
  await screen.findByRole("button", { name: "Save sign-in settings" });
  const idle = screen.getByLabelText("Sign out after inactivity (days)");
  fireEvent.change(idle, { target: { value: "40" } });
  expect(
    screen.getByRole("button", { name: "Save sign-in settings" }),
  ).toBeDisabled();
  fireEvent.change(idle, { target: { value: "14" } });
  await user.click(
    screen.getByRole("button", { name: "Save sign-in settings" }),
  );
  expect(saved).toHaveBeenCalledWith({
    adminSessionIdleDays: 14,
    adminSessionAbsoluteDays: 30,
  });
  await waitFor(() =>
    expect(toastSuccess).toHaveBeenCalledWith("Sign-in settings saved."),
  );
});


test("saves Protection cards independently without losing another card draft", async () => {
  cleanup();
  const saved = vi.fn(async (patch) => ({ ...settings, ...patch }));
  const user = userEvent.setup();
  renderSettings({ saveSettings: saved });
  await user.click(await screen.findByRole("tab", { name: "Protection" }));
  const submission = screen.getByLabelText("Submission rate limit (per minute)");
  const login = screen.getByLabelText("Login failure limit");
  await user.clear(submission);
  await user.type(submission, "8");
  await user.clear(login);
  await user.type(login, "7");
  const card = (title: string) => within(screen.getByRole("group", { name: title }));
  await user.click(card("Submission limits").getByRole("button", { name: "Save" }));
  await waitFor(() => expect(card("Submission limits").getByRole("button", { name: "Save" })).toBeDisabled());
  expect(saved).toHaveBeenLastCalledWith({
    submissionRateLimitPerMinute: 8,
    clientRateLimitPerMinute: 60,
    sourceRateLimitPerMinute: 120,
    clientBurstLimit: 15,
  });
  expect(login).toHaveValue(7);
  expect(card("Login protection").getByRole("button", { name: "Save" })).toBeEnabled();
  await user.click(card("Login protection").getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved).toHaveBeenLastCalledWith({ loginFailureLimit: 7, loginFailureWindowSeconds: 900 }));
  expect(card("Webhook protection").getByRole("button", { name: "Save" })).toBeDisabled();
});

test.each([
  ["misc", "misc", "Misc"],
  ["backup-and-restore", "backup-and-restore", "Backup and restore"],
])("opens #%s using the canonical Settings URL", async (hash, canonical, label) => {
  cleanup();
  window.history.replaceState(null, "", "/app/settings#" + hash);
  try {
    renderSettings();
    expect(await screen.findByRole("tab", { name: label, selected: true })).toBeVisible();
    expect(window.location.hash).toBe("#" + canonical);
  } finally {
    cleanup();
    window.history.replaceState(null, "", "/");
  }
});

test.each(["general", "miscellaneous", "backup"])("does not alias obsolete #%s", async (hash) => {
  cleanup();
  window.history.replaceState(null, "", "/app/settings#" + hash);
  try {
    renderSettings();
    expect(await screen.findByRole("tab", { name: "Account", selected: true })).toBeVisible();
    expect(window.location.hash).toBe("#" + hash);
  } finally {
    cleanup();
    window.history.replaceState(null, "", "/");
  }
});
