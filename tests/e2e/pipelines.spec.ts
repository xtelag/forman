import { expect, test } from "@playwright/test";

test("user creates an Inbox Pipeline and reviews its completed Run", async ({
  page,
}, testInfo) => {
  const sourceName = `Pipeline source ${testInfo.project.name}-${testInfo.retry}`;
  const pipelineName = `Archive submission ${testInfo.project.name}-${testInfo.retry}`;

  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();

  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(sourceName);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page
    .getByRole("dialog", { name: "Create Source" })
    .getByRole("button", { name: "Create Source" })
    .click();
  await expect(page).toHaveURL(
    /\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/,
  );
  const sourceId = new URL(page.url()).pathname.split("/").at(-1)!;

  await page.goto("/app/pipelines");
  await page.getByRole("button", { name: "Create Pipeline" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(pipelineName);
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .fill(sourceName);
  await page.getByRole("option", { name: sourceName }).click();
  await page
    .getByRole("dialog", { name: "Create Pipeline" })
    .getByRole("button", { name: "Create Pipeline" })
    .click();
  await expect(page).toHaveURL(
    /\/app\/pipelines\/[abcdefghjkmnpqrstuvwxyz023456789]{16}$/,
  );
  const pipelineId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Add Action" }).click();
  await page.getByLabel("Action 1 name").fill("Store submission");
  await page.getByLabel("Action 1 type").click();
  await page.getByRole("option", { name: "Inbox" }).click();
  await page.getByRole("button", { name: "Save Action" }).click();
  await expect(
    page.getByRole("button", { name: "Save Action" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("pipeline-editor.png"),
    fullPage: true,
  });

  expect(
    (
      await page.request.patch(`/api/admin/v1/sources/${sourceId}`, {
        headers: { origin: "http://localhost:3100" },
        data: { section: "protection", values: { altchaEnabled: false } },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Add Action", exact: true }).click();
  const longName = "Normalize" + "x".repeat(100);
  await page.getByLabel("Action 2 name", { exact: true }).fill(longName);
  await page.getByLabel("Transformation (JSONata)").fill('{"checked":true}');
  await page.screenshot({
    path: testInfo.outputPath("pipeline-before-long-save.png"),
    fullPage: true,
  });
  const second = page
    .locator('[data-slot="resource-section"]')
    .filter({ has: page.getByLabel("Action 2 name", { exact: true }) });
  await second
    .getByRole("button", { name: "Save Action", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Save Action", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move Action 2 up", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp("1\\. " + longName) }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("pipeline-long-name.png"),
    fullPage: true,
  });
  const submission = await page.request.post(`/api/submit/${sourceId}`, {
    data: { email: "e2e@example.test", name: "E2E contact" },
  });
  expect(submission.status()).toBe(202);

  await page.goto(`/app/pipelines/${pipelineId}/runs`);
  await expect
    .poll(
      async () => {
        await page.reload();
        await expect(
          page
            .getByRole("table", { name: "Pipeline Runs" })
            .or(page.locator('[data-slot="resource-table-mobile-list"]'))
            .filter({ visible: true }),
        ).toBeVisible();
        return page.getByText("Completed", { exact: true }).count();
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  const run = page
    .locator('[data-slot="resource-table-mobile-row"], tbody tr')
    .filter({ visible: true })
    .first();
  await run.click();
  await expect(
    page.locator('[data-slot="page-header-metadata"]', {
      hasText: "Completed",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /2\. Store submission/ }),
  ).toBeVisible();
});
