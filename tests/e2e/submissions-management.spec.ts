import { expect, test, type Page } from "@playwright/test";
import { openFilters } from "./support/filter-panel";

import { ensureE2eRateLimits } from "./support/rate-limits";

async function createSourceAndIssueToken(page: Page, name: string) {
  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(name);
  await page.getByRole("radio", { name: "M2M", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);

  const sourceId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("tab", { name: /Protection/ }).click();
  await page.getByRole("button", { name: "Show token" }).click();
  const tokenInput = page.getByRole("textbox", {
    name: "Machine-to-machine token value",
  });
  await expect(tokenInput).not.toHaveValue(/…/);
  const token = await tokenInput.inputValue();
  expect(token).toBeTruthy();
  return { sourceId, token: token! };
}

test("user searches and removes a captured submission", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "mobile") await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);

  const runId = `${testInfo.project.name}-${testInfo.retry}`;
  const firstName = `E2E search target ${runId}`;
  const secondName = `E2E other form ${runId}`;
  const first = await createSourceAndIssueToken(page, firstName);
  const second = await createSourceAndIssueToken(page, secondName);
  const searchValue = "manager-e2e@example.test";

  for (const [form, payload] of [
    [first, { email: [searchValue], priority: ["urgent"] }],
    [second, { email: ["other@example.test"], priority: ["normal"] }],
  ] as const) {
    const response = await page.request.post(`/api/submit/${form.sourceId}`, {
      data: payload,
      headers: { authorization: `Bearer ${form.token}` },
    });
    await expect(response).toBeOK();
  }

  await page.goto("/app/submissions");
  const submissionRows = page.locator('[data-slot="resource-table"]');
  await expect(submissionRows).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("table", { name: "Submissions" })).toBeHidden();
    await expect(page.locator('[data-slot="resource-table-mobile-list"]')).toBeVisible();
    await expect(page.locator('[data-slot="resource-table-mobile-list"] dt').first()).toHaveText("Received");
  } else {
    await expect(page.getByRole("table", { name: "Submissions" })).toBeVisible();
    await expect(page.locator('[data-slot="resource-table-mobile-list"]')).toBeHidden();
  }
  await expect(page.getByRole("link", { name: "Cards" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveCount(0);
  await openFilters(page);
  await page.getByLabel("Search").fill(searchValue);
  await page.getByRole("button", { name: "Apply filters" }).click();
  // Wait for the filtered page; the panel re-renders collapsed on phones afterwards.
  await expect(page).toHaveURL(/[?&]search=/);
  await page.getByRole('button',{name:/^Actions for Submission /}).filter({visible:true}).first().click();
  const selectedSubmissionLink = page.getByRole('menuitem',{name:'Open Submission',exact:true});
  const selectedSubmissionId = new URL((await selectedSubmissionLink.getAttribute('href'))!,page.url()).pathname.split('/').at(-1)!;
  await page.keyboard.press('Escape');

  await openFilters(page);
  await page.getByRole("link", { name: "Reset filters" }).click();
  await expect(page).toHaveURL("/app/submissions");
  await openFilters(page);
  await expect(page.getByLabel("Source", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Search")).toHaveValue("");
  await expect(submissionRows).toContainText(secondName);

  await expect(submissionRows).toContainText(firstName);

  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);

  await page.getByRole('button',{name:'Actions for Submission '+selectedSubmissionId,exact:true}).filter({visible:true}).click();
  const detailLink=page.getByRole('menuitem',{name:'Open Submission',exact:true});
  await expect(detailLink).toHaveAttribute('href','/app/submissions/'+selectedSubmissionId+'?returnTo=%2Fapp%2Fsubmissions');
  await detailLink.click();
  await page.getByRole('button',{name:'Submission actions'}).click();
  await expect(page.getByRole('menuitem',{name:'Open Source'})).toHaveAttribute('href', /^\/app\/sources\/[A-Za-z0-9_-]+$/);
  await page.getByRole('menuitem',{name:'Delete permanently'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('This action cannot be undone.');
  await dialog.getByRole('button',{name:'Delete permanently'}).click();
  await expect(page).toHaveURL('/app/submissions');
  await expect(page.locator('a[href^="/app/submissions/' + selectedSubmissionId + '?"]')).toHaveCount(0);
});

test("new submissions appear automatically while reviewing the list", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);

  const sourceName = `E2E polling form ${testInfo.project.name}-${testInfo.retry}`;
  const form = await createSourceAndIssueToken(page, sourceName);
  await page.clock.install();
  await page.goto("/app/submissions");
  await expect(page.getByText(/Updates automatically/)).toBeVisible();
  await expect(page.locator('[data-slot="resource-table"]').filter({ hasText: sourceName })).toHaveCount(0);

  const response = await page.request.post(`/api/submit/${form.sourceId}`, {
    data: { email: ["polling-e2e@example.test"] },
    headers: { authorization: `Bearer ${form.token}` },
  });
  await expect(response).toBeOK();

  await page.clock.fastForward(30_000);
  await expect(page.locator('[data-slot="resource-table"]')).toContainText(sourceName);
});
