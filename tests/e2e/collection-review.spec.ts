import { expect, test } from "@playwright/test";

test("review regression: draft-only page and actionable empty states", async ({page}, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", {name:"Login", exact:true}).click();
  await expect(page).toHaveURL("/app");
  const created = await page.request.post("/api/admin/v1/sources", {
    data:{type:"session",name:"Review "+testInfo.project.name},
    headers:{origin:"http://localhost:3100"},
  });
  expect(created.status()).toBe(201);
  const source = await created.json();
  let empty = false;
  await page.route("**/api/admin/v1/submissions?**", route => route.fulfill({json: empty
    ? {items:[], total:0, deletableTotal:0}
    : {items:[{id:"review-draft",sourceId:source.id,sourceName:source.name,
      sourcePublicId:source.sourceId,type:"session",state:"draft",payload:{},
      createdAt:new Date().toISOString(),tags:[]}],total:30,deletableTotal:20,snapshotBefore:new Date().toISOString()}
  }));
  await page.goto("/app/submissions?sourceId="+source.id);
  const top = page.getByRole("group", {name:"Top table controls"});
  await top.getByRole("button", {name:"Select all 20"}).click();
  await expect(top.getByText("20 selected")).toBeVisible();
  await expect(page.getByRole("checkbox", {name:"Select submission review-draft",exact:true})).not.toBeChecked();
  await expect(page.getByRole("checkbox", {name:"Select submission review-draft",exact:true})).toBeDisabled();
  empty = true;
  await page.reload();
  await expect(page.getByRole("link", {name:"Open Source",exact:true})).toHaveAttribute("href", "/app/sources/"+source.sourceId);
  for (const scheme of ["light","dark"]) {
    await page.evaluate(value => document.documentElement.setAttribute("data-mantine-color-scheme",value), scheme);
    await page.screenshot({path:testInfo.outputPath("empty-source-"+scheme+".png"),fullPage:true});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("textbox", {name:"Search",exact:true}).fill("no-match");
  await expect(page.getByRole("button", {name:"Clear filters",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Clear filters",exact:true}).click();
  await expect(page).not.toHaveURL(/search=/);
  await expect(page).toHaveURL(new RegExp("sourceId="+source.id));
  await expect(page.getByRole("link", {name:"Open Source",exact:true})).toBeVisible();
});
