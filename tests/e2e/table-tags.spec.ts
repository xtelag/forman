import { expect, test } from "@playwright/test";

test("Inbox tags use a dedicated column or mobile row and expand without opening the record", async ({ page }, info) => {
  await page.goto("/login");
  await page.getByLabel("Username", {exact:true}).fill("forman");
  await page.getByLabel("Password", {exact:true}).fill("forman-e2e-password-2026");
  await page.getByRole("button", {name:"Login",exact:true}).click();
  await expect(page).toHaveURL("/app");
  const longName = "Long tag " + "description".repeat(16);
  const tags = [{id:"a",name:"Sales",color:"blue"}, {id:"b",name:"Support",color:"teal"}, {id:"c",name:longName,color:"rose"}];
  await page.route("**/api/admin/v1/inbox?*", route => route.fulfill({json:{items:[{id:"tag-review", preview:"QA tagged response", sourceId:"source", sourcePublicId:"public", sourceName:"Contact", actionName:"Inbox", state:"read", trashedAt:null, createdAt:"2026-09-29T07:00:00Z", tags}],total:1}}));
  await page.goto("/app/inbox");
  const records = page.locator(info.project.name === "mobile" ? '[data-slot="resource-table-mobile-list"]' : '[data-slot="resource-table-desktop"]');
  await expect(records).toBeVisible();
  if (info.project.name !== "mobile") {
    await expect(records.getByRole("columnheader",{name:"Tags",exact:true})).toBeVisible();
    const cells=records.getByRole("row").nth(1).getByRole("cell");
    await expect(cells.nth(1)).not.toContainText("Sales");
    await expect(cells.nth(4)).toContainText("Sales");
  }
  const trigger=records.getByRole("button",{name:"Show all 3 tags"});
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(longName,{exact:true})).toBeVisible();
  await page.getByText(longName,{exact:true}).click();
  await expect(page).toHaveURL("/app/inbox");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("table-tags.png"),fullPage:true});
  await page.keyboard.press("Escape");
  await expect(page.getByText(longName,{exact:true})).not.toBeVisible();
});
