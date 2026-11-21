import { expect, test } from "@playwright/test";

test("sources collection and detail retain a shared header position and responsive representation", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();

  const name = `Sources presentation ${testInfo.project.name}-${testInfo.retry}`;
  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(name);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page
    .getByRole("dialog", { name: "Create Source" })
    .getByRole("button", { name: "Create Source", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/sources\/[^/]+$/);

  const nameInput = page.getByRole("textbox", {
    name: "Name",
    exact: true,
  });
  await expect(nameInput).toBeVisible();
  const save = page.getByRole("button", {
    name: "Save configuration",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await nameInput.fill(name + " updated");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled();
  await page.reload();
  await expect(nameInput).toHaveValue(name + " updated");
  await nameInput.fill(name);
  await save.click();
  await expect(save).toBeDisabled();

  await page.goto("/app/sources");
  const collectionHeader = page.locator('[data-slot="page-header"]');
  await expect(
    collectionHeader.getByRole("heading", { name: "Data Sources" }),
  ).toBeVisible();
  await expect(
    collectionHeader.getByRole("button", { name: "Create Source" }),
  ).toBeVisible();
  const collectionHeaderBox = await collectionHeader.boundingBox();

  const table = page.getByRole("table", { name: "Sources" });
  const mobileRows = page.locator('[data-slot="resource-table-mobile-row"]');
  if (testInfo.project.name === "mobile") {
    await expect(table).toBeHidden();
    await expect(mobileRows.filter({ hasText: name })).toHaveCount(1);
  } else {
    await expect(table).toBeVisible();
    await expect(mobileRows.first()).toBeHidden();
  }

  const sourceActionsTrigger =
    testInfo.project.name === "mobile"
      ? mobileRows
          .filter({ hasText: name })
          .getByRole("button", { name: `Actions for ${name}` })
      : table
          .getByRole("row", { name: new RegExp(name) })
          .getByRole("button", { name: `Actions for ${name}` });
  await sourceActionsTrigger.click();
  const sourceActions = page.getByRole("menu");
  await expect(
    sourceActions.getByRole("menuitem", { name: "Open Source details" }),
  ).toHaveCount(0);
  const showSubmissions = sourceActions.getByRole("menuitem", {
    name: "View Submissions",
  });
  const submissionsHref = await showSubmissions.getAttribute("href");
  expect(submissionsHref).toMatch(/\/app\/submissions\?sourceId=/);
  await showSubmissions.click();
  await expect(page).toHaveURL(submissionsHref!);
  await expect(page.getByLabel("Source", { exact: true })).toHaveValue(
    new URL(submissionsHref!, "http://localhost:3100").searchParams.get(
      "sourceId",
    )!,
  );

  await page.goto("/app/sources");

  const sourceLink =
    testInfo.project.name === "mobile"
      ? mobileRows.filter({ hasText: name })
      : table.getByRole("row", { name: new RegExp(name) });
  await sourceLink.click();
  const detailHeader = page.locator('[data-slot="page-header"]');
  await expect(detailHeader.getByRole("heading", { name })).toBeVisible();
  const returnToForms = detailHeader.getByRole("link", {
    name: "Back to all sources",
  });
  await expect(returnToForms).toBeVisible();
  await expect(returnToForms).toHaveText("");
  const detailHeaderBox = await detailHeader.boundingBox();
  expect(detailHeaderBox?.y).toBe(collectionHeaderBox?.y);
});
