import { test, expect } from "@playwright/test";
test("Source templates and schema-gated integrations", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const headers = { origin: "http://localhost:3100" };
  const source = await (
    await page.request.post("/api/admin/v1/sources", {
      headers,
      data: { name: `Templates ${testInfo.project.name}`, type: "session" },
    })
  ).json();
  const path = `/api/admin/v1/sources/${source.sourceId}`;
  await page.goto(`/app/sources/${source.sourceId}`);
  await page.getByRole("tab", { name: "Integration", exact: true }).click();
  await expect(page.getByRole("note")).toContainText(
    "Field definition required",
  );
  await expect(page.getByRole("tabpanel").getByRole("tab")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("no-schema.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Configure Source fields" }).click();
  const definition = page.getByLabel("Definition (JSON Schema)");
  await expect(definition).toBeFocused();
  await expect(
    page.getByLabel("Templates").locator('option[value="survey"]'),
  ).toHaveCount(1);
  await page.getByLabel("Templates").selectOption("registration");
  expect(
    (await (await page.request.get(path)).json()).source.fieldDefinitionSource,
  ).toBeNull();
  await page.getByLabel("Templates").selectOption("registration");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Save Source fields", exact: true })
    .click();
  await page.getByRole("tab", { name: "Integration", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Example", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(path)).json()).integration.examplesAvailable,
  ).toBe(true);

  await page.getByRole("tab", { name: "Configuration", exact: true }).click();
  await expect(page.getByLabel("Enable sessions", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(
      /Source · (One-shot|Session|M2M) · ID:/,
    ),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("configuration.png"),
    fullPage: true,
  });
  await expect(page.getByRole("tab", { name: /^Advanced/ })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  const savedToast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Source settings saved" });
  if (await savedToast.isVisible())
    await savedToast
      .getByRole("button", { name: "Close toast", exact: true })
      .click();
  await page.getByRole("tab", { name: /^Advanced/ }).click();
  await page.getByLabel("Expire after inactivity (days)").fill("14");
  await page
    .getByRole("button", { name: "Save advanced configuration", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Save advanced configuration",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    (await (await page.request.get(path)).json()).sessionSettings,
  ).toMatchObject({ enabled: true, inactivityDays: 14 });
  await expect(page.getByLabel("Expire after inactivity (days)")).toHaveValue(
    "14",
  );
  await page.screenshot({
    path: testInfo.outputPath("advanced.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Source fields", exact: true }).click();
  await page.getByLabel("Templates").selectOption("survey");
  await page
    .getByRole("button", { name: "Replace definition", exact: true })
    .click();
  expect(JSON.parse(await definition.inputValue()).properties.rating).toEqual({
    type: "integer",
    minimum: 1,
    maximum: 5,
  });
  await definition.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("survey-template.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
