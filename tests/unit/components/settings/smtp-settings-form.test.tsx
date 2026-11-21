import { cleanup, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SmtpSettingsForm } from "@/components/settings/smtp-settings-form";

const { sendSmtpTestEmail, updateSmtpSettings } = vi.hoisted(() => ({
  sendSmtpTestEmail: vi.fn(),
  updateSmtpSettings: vi.fn(),
}));
vi.mock("@/client/admin-api/settings", () => ({
  removeSmtpPassword: vi.fn(),
  sendSmtpTestEmail,
  updateSmtpSettings,
}));

describe("SmtpSettingsForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });


  test("hides credentials and saves without authentication", async () => {
    const user = userEvent.setup();
    updateSmtpSettings.mockResolvedValueOnce({});
    render(<SmtpSettingsForm onSaved={vi.fn()} settings={{
      from: "forman@example.test", host: "localhost", port: 1025,
      encryption: "none", passwordConfigured: false, username: null, status: "not-configured",
    }} />);
    await user.click(screen.getByRole("checkbox", { name: "Authentication" }));
    expect(screen.getByLabelText("Username")).not.toBeVisible();
    expect(screen.getByLabelText("Password")).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save SMTP settings" }));
    expect(updateSmtpSettings).toHaveBeenCalledWith(expect.objectContaining({ authentication: false, username: undefined }));
    expect(updateSmtpSettings.mock.calls[0][0]).not.toHaveProperty("password");
  });
  test("keeps an existing password blank while saving other SMTP settings", async () => {
    const user = userEvent.setup();
    updateSmtpSettings.mockResolvedValueOnce({});
    render(
      <SmtpSettingsForm
        onSaved={vi.fn()}
        settings={{
          from: "forman@example.test",
          host: "smtp.example.test",
          passwordConfigured: true,
          port: 587,
          encryption: "starttls",
          status: "ready",
          username: "forman",
        }}
      />,
    );
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      screen.getByRole("button", { name: "About Password" }),
    ).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "About Password" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Leave blank to keep the saved password.");
    await user.unhover(screen.getByRole("button", { name: "About Password" }));
    expect(
      screen.getByRole("button", { name: "Save SMTP settings" }),
    ).toBeDisabled();
    await user.clear(screen.getByLabelText("Host"));
    await user.type(screen.getByLabelText("Host"), "smtp.updated.test");
    await user.click(
      screen.getByRole("button", { name: "Save SMTP settings" }),
    );
    expect(updateSmtpSettings).toHaveBeenCalledWith({
      from: "forman@example.test",
      authentication: true, fromName: "",
      host: "smtp.updated.test",
      port: 587,
      encryption: "starttls",
      username: "forman",
    });
  });

  test("sends a test email through the SMTP server currently entered in the form", async () => {
    const user = userEvent.setup();
    sendSmtpTestEmail.mockResolvedValueOnce(undefined);
    render(
      <SmtpSettingsForm
        onSaved={vi.fn()}
        settings={{
          from: "forman@example.test",
          host: "smtp.saved.test",
          passwordConfigured: true,
          port: 587,
          encryption: "starttls",
          status: "ready",
          username: "forman",
        }}
      />,
    );
    await user.clear(screen.getByLabelText("Host"));
    await user.type(screen.getByLabelText("Host"), "smtp.current-form.test");
    await user.type(screen.getByLabelText("From name (optional)"), "Telag");
    await user.click(screen.getByRole("button", { name: "Send test email" }));
    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText("Recipient email") as HTMLInputElement).value,
    ).toBe("");
    expect(within(dialog).getByLabelText("Recipient email")).toHaveAttribute("placeholder", "you@example.com");
    await user.type(within(dialog).getByLabelText("Recipient email"), "recipient@example.test");
    await user.click(
      within(dialog).getByRole("button", { name: "Send test email" }),
    );
    expect(sendSmtpTestEmail).toHaveBeenCalledWith({
      smtp: {
        from: "forman@example.test",
        authentication: true, fromName: "Telag",
        host: "smtp.current-form.test",
        port: 587,
        encryption: "starttls",
        username: "forman",
      },
      to: "recipient@example.test",
    });
    expect(toast.success).toHaveBeenCalledWith("Test email sent.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

test("defaults to TLS/465 and selects editable standard ports", async () => {
  const user = userEvent.setup();
  render(
    <SmtpSettingsForm
      onSaved={vi.fn()}
      settings={{
        from: null,
        host: null,
        passwordConfigured: false,
        port: null,
        encryption: "tls",
        status: "not-configured",
        username: null,
      }}
    />,
  );
  expect(screen.getByLabelText("Port")).toHaveValue(465);
  await user.click(screen.getByLabelText("STARTTLS"));
  expect(screen.getByLabelText("Port")).toHaveValue(587);
  await user.clear(screen.getByLabelText("Port"));
  await user.type(screen.getByLabelText("Port"), "2525");
  expect(screen.getByLabelText("Port")).toHaveValue(2525);
  await user.click(screen.getByLabelText("None"));
  expect(screen.getByLabelText("Port")).toHaveValue(25);
  await user.click(screen.getByLabelText("TLS"));
  expect(screen.getByLabelText("Port")).toHaveValue(465);
});

test("shows a failed test email inside the open dialog", async () => {
  cleanup();
  const user = userEvent.setup();
  sendSmtpTestEmail.mockRejectedValueOnce(new Error("SMTP connection refused"));
  render(
    <SmtpSettingsForm
      onSaved={vi.fn()}
      settings={{
        from: "forman@example.test",
        host: "smtp.example.test",
        passwordConfigured: true,
        port: 587,
        encryption: "starttls",
        status: "ready",
        username: "forman",
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Send test email" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Recipient email"), "recipient@example.test");
  await user.click(
    within(dialog).getByRole("button", { name: "Send test email" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "SMTP connection refused",
  );
  expect(within(dialog).getByLabelText("Recipient email")).toHaveValue(
    "recipient@example.test",
  );
  cleanup();
});
