import { expect, test, type Page } from "@playwright/test";
import { ensureE2eRateLimits } from "./support/rate-limits";

// Local runs have no retries. Preserve evidence from the first failure too.
test.use({
  trace: "retain-on-failure",
  screenshot: { mode: "only-on-failure", fullPage: true },
});

const saveDiagnostics = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const events: string[] = [];
  saveDiagnostics.set(page, events);
  page.on("pageerror", (error) => events.push("Page error: " + error.message));
  page.on("requestfailed", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/admin/v1/pages"))
      events.push(
        request.method() +
          " " +
          path +
          " failed: " +
          request.failure()?.errorText,
      );
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (
      path.startsWith("/api/admin/v1/pages") &&
      response.request().method() === "PATCH"
    )
      events.push("PATCH " + path + " HTTP " + response.status());
  });
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await info.attach("form-save-diagnostics", {
      body: JSON.stringify(saveDiagnostics.get(page) ?? [], null, 2),
      contentType: "application/json",
    });
  }
  saveDiagnostics.delete(page);
});

async function saveFormSection(page: Page, adminPath: string, button: string) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === adminPath &&
        response.request().method() === "PATCH",
      { timeout: 5_000 },
    ),
    page.getByRole("button", { name: button, exact: true }).click(),
  ]);
  expect(response.status(), button + " must be accepted by the server").toBe(
    200,
  );
}

test("configured Pages save steps, resume elsewhere, preview safely and submit one-shot", async ({
  page,
  browser,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);
  const headers = { origin: "http://localhost:3100" };
  const created = await page.request.post("/api/admin/v1/sources", {
    headers,
    data: { name: `Pages ${testInfo.project.name}`, type: "session" },
  });
  expect(created.status()).toBe(201);
  const source = await created.json();
  const sourcePath = `/api/admin/v1/sources/${source.sourceId}`;
  expect(
    (
      await page.request.patch(sourcePath, {
        headers,
        data: { section: "protection", values: { altchaEnabled: false } },
      })
    ).ok(),
  ).toBe(true);
  const fields =
    '{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":100},"email":{"type":"string","format":"email","minLength":1,"maxLength":100}},"required":["name","email"],"additionalProperties":false}';
  expect(
    (
      await page.request.patch(sourcePath, {
        headers,
        data: {
          section: "source-fields",
          values: {
            fieldDefinitionMode: "json-schema",
            fieldDefinitionSource: fields,
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/app/pages");
  await page.getByRole("button", { name: "Create Built-in Form", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create Built-in Form" });
  await dialog
    .getByRole("textbox", { name: "Name" })
    .fill("Configured survey");
  await dialog
    .getByRole("combobox", { name: "Source", exact: true })
    .fill(source.name);
  await page.getByRole("option", { name: source.name, exact: true }).click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/v1/pages") &&
      r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Create Built-in Form", exact: true })
    .click();
  const pageResult = await response;
  expect(pageResult.status()).toBe(201);
  const hosted = await pageResult.json();
  const config = {
    steps: [
      { id: 1, title: "O vás" },
      { id: 3, title: "Kontakt" },
    ],
    language: "cs",
    title: "Dobrý den, {{name}}",
    successText: "Hotovo, {{name}}",
    fields: [
      {
        name: "name",
        step: 1,
        queryParam: "who",
        defaultValue: "Výchozí",
        label: "Jméno",
      },
      {
        name: "email",
        step: 3,
        label: "E-mail",
        textControl: "textarea" as const,
      },
    ],
  };
  const adminPath = `/api/admin/v1/pages/${hosted.pageId}`;
  expect(
    (
      await page.request.patch(adminPath, {
        headers,
        data: { name: hosted.name, enabled: true, presentation: config },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/app/pages/${hosted.pageId}`);
  for (const name of [
    "Configuration",
    "Content & fields",
    "Buttons & messages",
    "Appearance",
    "QR",
  ]) {
    await expect(
      page.getByRole("main").getByRole("tab", { name, exact: true }),
    ).toHaveAttribute(
      "aria-selected",
      name === "Configuration" ? "true" : "false",
    );
  }
  await page.screenshot({
    path: testInfo.outputPath("form-sections-closed.png"),
    fullPage: true,
  });
  await page
    .getByRole("tab", { name: "Content & fields", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const definition = page.getByLabel("Content & fields (JSON)");
  const content = JSON.parse(await definition.inputValue());
  expect(content.title).toBe(config.title);
  expect(content.steps.map((step: { id: number }) => step.id)).toEqual([1, 3]);
  content.steps[1].title = "Kontakt na vás";
  content.steps[0].fields[0].helpText = "Vaše jméno";
  await definition.fill("{bad}");
  await expect(page.getByText(/Invalid JSON/)).toBeVisible();
  await definition.fill(JSON.stringify(content));
  await expect(
    page
      .locator('[data-slot="resource-section"]')
      .filter({ has: definition })
      .getByRole("button", { name: "Save form", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Content & fields", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Buttons & messages", exact: true })
    .click();
  const messages = page.getByLabel("Buttons & messages (JSON)");
  const dictionary = JSON.parse(await messages.inputValue());
  dictionary.submit = "Poslat";
  await messages.fill(JSON.stringify(dictionary, null, 2));
  await page.screenshot({
    path: testInfo.outputPath("form-messages.png"),
    fullPage: true,
  });
  await page
    .getByRole("tab", { name: "Buttons & messages", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Content & fields", exact: true })
    .click();
  await expect(definition).toHaveValue(JSON.stringify(content));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("form-jsonl.png"),
    fullPage: true,
  });
  await saveFormSection(page, adminPath, "Save form");
  await expect(
    page.getByRole("button", { name: "Save form", exact: true }),
  ).toBeDisabled();
  const savedForm = await (await page.request.get(adminPath)).json();
  expect(savedForm.presentation.systemTexts.submit).toBe("Poslat");
  expect(savedForm.presentation.steps[1].title).toBe("Kontakt na vás");
  await page.screenshot({
    path: testInfo.outputPath("form-layout-editor.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("page-editor.png"),
    fullPage: true,
  });
  await page.getByLabel("Form width (480–960 px)").fill("720");
  await saveFormSection(page, adminPath, "Save appearance");
  await expect(
    page.getByRole("button", { name: "Save appearance" }),
  ).toBeDisabled();
  const previewIntakeRequests: string[] = [];
  const trackPreviewIntake = (request: import("@playwright/test").Request) => {
    if (new URL(request.url()).pathname.startsWith("/api/submit/")) previewIntakeRequests.push(request.url());
  };
  page.on("request", trackPreviewIntake);
  await page.goto(`/app/preview/${hosted.pageId}`);
  await expect(
    page.getByText("Režim náhledu. Odpovědi se neodešlou a akce Pipeline se nespustí."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Další", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill("preview@example.test");
  await page.getByRole("button", { name: "Poslat", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pipeline" })).toContainText("Náhled dokončen");
  expect(previewIntakeRequests).toEqual([]);
  page.off("request", trackPreviewIntake);
  await page.goto(`${hosted.publicUrl}?who=Ada`);
  await expect(page.getByLabel("Jméno", { exact: true })).toHaveValue("Ada");
  await page.getByRole("button", { name: "Další", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kopírovat odkaz pro pokračování", exact: true }),
  ).toBeVisible();
  const link = page.url();
  expect(link).toContain("#session=");
  expect(link).not.toContain("who=");
  const context = await browser.newContext({
    viewport:
      testInfo.project.name === "mobile"
        ? { width: 393, height: 851 }
        : { width: 1280, height: 900 },
  });
  try {
    const resumed = await context.newPage();
    let rejectRead = true;
    await resumed.route(`**/api/submit/${source.sourceId}`, async (route) => {
      if (rejectRead && route.request().postDataJSON().operation === "read") {
        rejectRead = false;
        await route.fulfill({
          status: 429,
          headers: { "retry-after": "1" },
          contentType: "application/json",
          body: JSON.stringify({ error: "Too many requests." }),
        });
      } else await route.continue();
    });
    await resumed.goto(link);
    await expect(
      resumed.getByRole("button", { name: "Zkusit načíst znovu", exact: true }),
    ).toBeVisible();
    await expect(resumed.getByLabel("Jméno", { exact: true })).toBeHidden();
    await expect(
      resumed.getByRole("button", { name: "Další", exact: true }),
    ).toBeHidden();
    await resumed
      .getByRole("button", { name: "Zkusit načíst znovu", exact: true })
      .click();
    await expect(resumed.getByLabel("E-mail", { exact: true })).toBeVisible();
    await expect(resumed.getByRole("heading", { level: 1 })).toHaveText(
      "Dobrý den, Ada",
    );
    for (let refresh = 0; refresh < 2; refresh++) {
      await resumed.reload();
      await expect(resumed.getByLabel("E-mail", { exact: true })).toBeVisible();
      await expect(resumed.getByRole("heading", { level: 1 })).toHaveText(
        "Dobrý den, Ada",
      );
    }
    await expect(
      resumed.getByRole("button", { name: "Uložit průběh", exact: true }),
    ).toBeHidden();
    await resumed.getByLabel("E-mail", { exact: true }).fill("draft");
    await resumed.getByRole("button", { name: "Zpět", exact: true }).click();
    await expect(resumed.getByLabel("Jméno", { exact: true })).toHaveValue(
      "Ada",
    );
    await resumed.reload();
    await expect(resumed.getByLabel("Jméno", { exact: true })).toHaveValue(
      "Ada",
    );
    await resumed.getByRole("button", { name: "Další", exact: true }).click();
    await expect(resumed.getByLabel("E-mail", { exact: true })).toHaveValue(
      "draft",
    );
    await resumed.getByLabel("E-mail", { exact: true }).fill("");
    await resumed.screenshot({
      path: testInfo.outputPath("session-step.png"),
      fullPage: true,
    });
    await resumed.getByRole("button", { name: "Poslat", exact: true }).click();
    await expect(resumed.getByText("Toto pole je povinné.")).toBeVisible();
    await resumed.getByLabel("E-mail", { exact: true }).fill("invalid-address");
    await resumed.getByRole("button", { name: "Poslat", exact: true }).click();
    await expect(
      resumed.getByText("Zadejte platnou e-mailovou adresu."),
    ).toBeVisible();
    await expect(resumed.getByLabel("E-mail", { exact: true })).toBeFocused();
    await resumed.screenshot({
      path: testInfo.outputPath("schema-validation.png"),
      fullPage: false,
    });
    await resumed
      .getByLabel("E-mail", { exact: true })
      .fill("ada@example.test");
    await resumed.getByRole("button", { name: "Poslat", exact: true }).click();
    await expect(resumed.getByText("Hotovo, Ada")).toBeVisible();
    for (let refresh = 0; refresh < 2; refresh++) {
      await resumed.reload();
      await expect(resumed.getByText("Hotovo, Ada")).toBeVisible();
    }
    expect(
      await resumed.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
  const review = await (
    await page.request.get(
      `/api/admin/v1/submissions?sourceId=${source.id}&type=session`,
    )
  ).json();
  expect(review.total).toBe(1);
  expect(review.items[0].state).toBe("completed");
  const onceCreated = await page.request.post("/api/admin/v1/sources", {
    headers,
    data: { name: `One-shot ${testInfo.project.name}`, type: "one-shot" },
  });
  expect(onceCreated.status()).toBe(201);
  const onceSource = await onceCreated.json();
  expect(
    (
      await page.request.patch(`/api/admin/v1/sources/${onceSource.sourceId}`, {
        headers,
        data: { section: "protection", values: { altchaEnabled: false } },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.patch(`/api/admin/v1/sources/${onceSource.sourceId}`, {
        headers,
        data: {
          section: "source-fields",
          values: {
            fieldDefinitionMode: "json-schema",
            fieldDefinitionSource: fields,
          },
        },
      })
    ).ok(),
  ).toBe(true);
  const oncePageResult = await page.request.post("/api/admin/v1/pages", {
    headers,
    data: { name: "One-shot contact", sourceId: onceSource.id },
  });
  expect(oncePageResult.status()).toBe(201);
  const oncePage = await oncePageResult.json();
  expect(
    (
      await page.request.patch(`/api/admin/v1/pages/${oncePage.pageId}`, {
        headers,
        data: {
          name: oncePage.name,
          enabled: true,
          presentation: {
            ...config,
            successUrl: "https://complete.example.test/done",
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.route("https://complete.example.test/done", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Completed</h1>" }),
  );
  await page.goto(oncePage.publicUrl);
  await expect(page.getByLabel("Jméno", { exact: true })).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill("once@example.test");
  await page.getByRole("button", { name: "Odeslat", exact: true }).click();
  await expect(page).toHaveURL("https://complete.example.test/done");
});
