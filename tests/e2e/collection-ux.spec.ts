import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("shared collection controls: search, filters, selection, paging and responsive themes", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  for (let index = 0; index < 11; index++) {
    const response = await page.request.post("/api/admin/v1/examples", {
      data: {kind: "form", requestId: randomUUID()},
      headers: {origin: "http://localhost:3100"},
    });
    expect(response.status()).toBeLessThan(300);
  }
  const lists = [
    {path:"sources", table:"Sources", selection:"Select sources on this page"},
    {path:"pages", table:"Built-in Forms", selection:"Select built-in forms on this page"},
    {path:"pipelines", table:"Pipelines", selection:"Select pipelines on this page"},
    {path:"inbox", table:"Inbox", selection:"Select inbox on this page"},
    {path:"pipeline-runs", table:"Pipeline Runs", selection:null},
  ];
  for (const list of lists) {
    await page.goto("/app/" + list.path);
    const table = page.getByRole("table", {name:list.table, exact:true});
    await expect(table).toBeVisible();
    const top = page.getByRole("group", {name:"Top table controls", exact:true});
    const bottom = page.getByRole("group", {name:"Bottom table controls", exact:true});
    await expect(top).toBeVisible();
    await expect(bottom).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(11);
    if (list.selection) {
      await table.getByRole("checkbox", {name:list.selection, exact:true}).check();
      await expect(top.getByText("10 selected", {exact:true})).toBeVisible();
      await expect(bottom.getByText("10 selected", {exact:true})).toBeVisible();
      await top.getByRole("button", {name:"Next page", exact:true}).click();
      await expect(page).toHaveURL(/page=2/);
      await expect(top.getByText("10 selected", {exact:true})).toBeVisible();
      await top.getByRole("button", {name:"Clear selection", exact:true}).click();
    }
    await page.getByRole("textbox", {name:"Search", exact:true}).fill("no-matching-collection-fixture");
    await expect(page).toHaveURL(/search=no-matching-collection-fixture/);
    await expect(table).toHaveCount(0);
    await expect(page.getByRole("button", {name:"Remove filter Search", exact:false})).toHaveCount(0);
    await page.getByRole("button", {name:"Clear search", exact:true}).click();
    await expect(table).toBeVisible();
    await page.getByRole("button", {name:"Filters", exact:true}).click();
    await expect(page.getByRole("search")).toBeVisible();
    await page.keyboard.press("Escape");
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.setAttribute("data-mantine-color-scheme", value), scheme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await bottom.scrollIntoViewIfNeeded();
      await expect(bottom).toBeVisible();
      await page.screenshot({path:testInfo.outputPath(list.path + "-" + scheme + ".png"), fullPage:true});
    }
  }
  await page.goto("/app/callbacks");
  await expect(page.getByRole("textbox", {name:"Search", exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Filters", exact:true}).click();
  await expect(page.getByLabel("Waiting at least", {exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", {name:"No Waiting Callbacks", exact:false})).toBeVisible();
});
