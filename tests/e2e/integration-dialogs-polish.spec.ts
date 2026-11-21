import { expect, test } from "@playwright/test";

test("integration dialogs keep failures and pending work visible", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const response = await page.request.post("/api/admin/v1/sources", {
    headers: { origin: "http://localhost:3100" },
    data: { name: "Dialog polish " + testInfo.project.name, type: "m2m" },
  });
  expect(response.ok()).toBe(true);
  const source = await response.json();
  const schema = {
    type: "object",
    properties: { message: { type: "string" } },
    additionalProperties: false,
  };
  expect(
    (
      await page.request.patch("/api/admin/v1/sources/" + source.sourceId, {
        headers: { origin: "http://localhost:3100" },
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
  await page.goto("/app/sources/" + source.sourceId);
  await page.getByRole("tab", { name: "Protection", exact: true }).click();
  await page
    .getByRole("button", { name: "Regenerate token", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Regenerate machine-to-machine token?",
  });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.route("**/server-token", (route) =>
    route.fulfill({ status: 500, json: { error: "Test failure" } }),
  );
  await dialog.getByRole("button", { name: "Regenerate token" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "The token could not be regenerated",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await expect(
      dialog.getByRole("button", { name: "Cancel" }),
    ).toBeInViewport();
  }
  await page.screenshot({ path: testInfo.outputPath("token-error.png") });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Regenerate token" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("tab", { name: "Integration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send test Submission", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Send test Submission" });
  await dialog.getByLabel("JSON payload").fill("[");
  await dialog.getByRole("button", { name: "Send test Submission" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Enter valid JSON before sending the test Submission.",
  );
  await expect(dialog.getByLabel("JSON payload")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await dialog.getByLabel("JSON payload").fill('{"message":"preview only"}');
  await page.screenshot({
    path: testInfo.outputPath("test-submission-mobile.png"),
  });
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let requests = 0;
  await page.route("**/test-submission", async (route) => {
    requests++;
    await gate;
    await route.fulfill({
      json: { submissionId: "preview-result", success: true },
    });
  });
  await dialog.getByRole("button", { name: "Send test Submission" }).click();
  await expect(dialog.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeDisabled();
  finish();
  await expect(dialog.getByRole("status")).toContainText(
    "Test Submission created.",
  );
  expect(requests).toBe(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
});
