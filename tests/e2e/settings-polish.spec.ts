import { expect, test } from "@playwright/test";

test("settings retain drafts and expose save feedback on desktop and mobile", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const original = await (
    await page.request.get("/api/admin/v1/settings")
  ).json();
  let settings = { ...original };
  const saves: Record<string, unknown>[] = [];
  await page.route("**/api/admin/v1/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const values = route.request().postDataJSON();
      saves.push(values);
      settings = {
        ...settings,
        ...values,
        updatedAt: new Date().toISOString(),
      };
    }
    await route.fulfill({ json: settings });
  });
  await page.goto("/app/settings");
  const general = page.getByRole("tab", {
    name: "Misc",
    exact: true,
  });
  await general.click();
  const saveGeneral = page.getByRole("button", {
    name: "Save misc settings",
    exact: true,
  });
  await expect(saveGeneral).toBeDisabled();
  await page
    .getByLabel("Failed Action retention (days)", { exact: true })
    .fill("47");
  await general.click();
  await page
    .getByRole("tab", { name: "Protection", exact: true })
    .click();
  const rate = page.getByRole("spinbutton", {
    name: "Client burst limit",
    exact: true,
  });
  await rate.fill("23");
  await general.click();
  await expect(
    page.getByLabel("Failed Action retention (days)", { exact: true }),
  ).toHaveValue("47");
  await saveGeneral.click();
  await expect(
    page.getByText("Misc settings saved.", { exact: true }),
  ).toBeVisible();
  expect(saves[0]).toEqual({
    failedActionRetentionDays: 47,
    formspreeCompatibilityEndpointEnabled:
      original.formspreeCompatibilityEndpointEnabled,
    inboxRetentionDays: original.inboxRetentionDays,
  });
  await page
    .getByRole("tab", { name: "Protection", exact: true })
    .click();
  await expect(rate).toHaveValue("23");
  await page
    .locator("section").filter({ has: page.getByRole("heading", { name: "Submission limits", exact: true }) }).getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    page.getByText("Submission limits saved.", { exact: true }),
  ).toBeVisible();
  expect(saves[1].clientBurstLimit).toBe(23);
  expect(saves[1]).not.toHaveProperty("webhookSsrfProtectionEnabled");
  await page.getByRole("tab", { name: "Robots", exact: true }).click();
  await page
    .getByLabel("robots.txt", { exact: true })
    .fill("User-agent: *\nDisallow: /private/\n");
  await page
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    page.getByText("Robots.txt saved.", { exact: true }),
  ).toBeVisible();
  expect(saves[2]).toEqual({
    robotsTxt: "User-agent: *\nDisallow: /private/\n",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("tabpanel", { name: "Robots", exact: true }),
  ).toHaveCSS("overflow", "visible");
  await page
    .getByRole("heading", { name: "Settings", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("settings.png"),
    fullPage: true,
  });
});

test("SMTP errors stay in their dialog and backup restore requires confirmation", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const settings = await (
    await page.request.get("/api/admin/v1/settings")
  ).json();
  settings.smtp = {
    from: "sender@example.test",
    host: "smtp.example.test",
    port: 587,
    encryption: "starttls",
    username: "forman",
    passwordConfigured: true,
    status: "ready",
  };
  await page.route("**/api/admin/v1/settings", (route) =>
    route.fulfill({ json: settings }),
  );
  let sent: unknown;
  await page.route("**/api/admin/v1/settings/smtp/test", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      status: 400,
      json: { error: "SMTP connection refused" },
    });
  });
  let restores = 0;
  await page.route("**/api/admin/v1/backup/restore", (route) => {
    restores++;
    return route.fulfill({
      status: 400,
      json: { error: "Wrong backup password" },
    });
  });
  await page.goto("/app/settings#smtp");
  await expect(
    page.getByRole("tab", { name: "SMTP", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("radio", { name: "TLS", exact: true }).check();
  await expect(page.getByLabel("Port", { exact: true })).toHaveValue("465");
  await page.getByLabel("Port", { exact: true }).fill("2465");
  await page
    .getByRole("button", { name: "Send test email", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Send SMTP test email",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Send test email", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText("SMTP connection refused");
  expect(sent).toEqual({
    smtp: {
      from: "sender@example.test",
      host: "smtp.example.test",
      port: 2465,
      encryption: "tls",
      username: "forman",
    },
    to: "sender@example.test",
  });
  await page.screenshot({ path: testInfo.outputPath("smtp-error.png") });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("tab", { name: "Backup and restore", exact: true })
    .click();
  await page.getByLabel("Upload backup file", { exact: true }).setInputFiles({
    name: "test.forman-backup",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("test fixture"),
  });
  await page
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Restore backup?",
    exact: true,
  });
  await expect(confirmation).toContainText(
    "Permanently replaces all current data",
  );
  expect(restores).toBe(0);
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmation).toBeHidden();
  expect(restores).toBe(0);
  await page
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await expect(confirmation).toBeHidden();
  await expect(
    page.getByRole("alert").filter({ hasText: "Wrong backup password" }),
  ).toBeVisible();
  expect(restores).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
