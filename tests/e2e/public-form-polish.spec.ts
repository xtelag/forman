import { expect, test } from "@playwright/test";

test("hosted form keeps configured colors, readable validation and typed controls", async ({
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
  const created = await page.request.post("/api/admin/v1/sources", {
    headers,
    data: {
      name: "Public controls " + testInfo.project.name,
      type: "one-shot",
    },
  });
  expect(created.status()).toBe(201);
  const source = await created.json();
  const path = "/api/admin/v1/sources/" + source.sourceId;
  const schema = {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      topic: { type: "string", enum: ["Support", "Sales"] },
      amount: { type: "number" },
      approved: { type: "boolean" },
    },
    required: ["email", "topic", "amount", "approved"],
    additionalProperties: false,
  };
  expect(
    (
      await page.request.patch(path, {
        headers,
        data: {
          section: "source-fields",
          values: {
            fieldDefinitionMode: "json-schema",
            fieldDefinitionSource: JSON.stringify(schema),
          },
        },
      })
    ).ok(),
  ).toBe(true);
  const createdPage = await page.request.post("/api/admin/v1/pages", {
    headers,
    data: { name: "Public controls", sourceId: source.id },
  });
  expect(createdPage.status(), await createdPage.text()).toBe(201);
  const hosted = await createdPage.json();
  const title = "Long-title-".repeat(15);
  const presentation = {
    title,
    description: "Check the fields below.",
    theme: {
      background: "#101828",
      surface: "#1d2939",
      text: "#f9fafb",
      button: "#facc15",
      buttonText: "#111827",
      width: 720,
      radius: 16,
    },
    fields: [
      { name: "email", label: "Email", helpText: "Long-help-".repeat(40) },
      { name: "topic", label: "Topic" },
      { name: "amount", label: "Amount" },
      { name: "approved", label: "Approved" },
    ],
  };
  expect(
    (
      await page.request.patch("/api/admin/v1/pages/" + hosted.pageId, {
        headers,
        data: { name: hosted.name, enabled: true, presentation },
      })
    ).ok(),
  ).toBe(true);
  let submissions = 0;
  await page.route("**/api/submit/" + source.sourceId, (route) => {
    submissions++;
    return route.abort();
  });
  await page.goto("/app/preview/" + hosted.pageId);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveCSS("background-color", "rgb(29, 41, 57)");
  const focusField = page.getByRole("textbox", { name: "Email", exact: true });
  const unfocusedBorder = await focusField.evaluate(
    (el) => getComputedStyle(el).borderColor,
  );
  await focusField.focus();
  await expect(focusField).not.toHaveCSS("border-color", unfocusedBorder);
  const submit = page.getByRole("button", { name: "Submit", exact: true });
  await expect(submit).toHaveCSS("background-color", "rgb(250, 204, 21)");
  await submit.click();
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await expect(email).toBeFocused();
  await expect(email).toHaveAccessibleDescription(/This field is required/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const titleWidth = await page
    .getByRole("heading", { level: 1 })
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(titleWidth).toBeGreaterThan(
    (page.viewportSize()?.width ?? 1280) < 500 ? 280 : 500,
  );
  await page.screenshot({
    path: testInfo.outputPath("validation.png"),
    fullPage: true,
  });
  await email.fill("person@example.test");
  await page
    .getByRole("combobox", { name: "Topic", exact: true })
    .selectOption("Sales");
  await page
    .getByRole("spinbutton", { name: "Amount", exact: true })
    .fill("-12.5");
  await page.getByRole("checkbox", { name: "Approved", exact: true }).check();
  await expect(page.locator(".mantine-Checkbox-icon")).toHaveCSS(
    "color",
    "rgb(17, 24, 39)",
  );
  await submit.click();
  await expect(
    page.getByText("The response has been submitted.", { exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(0);
});
