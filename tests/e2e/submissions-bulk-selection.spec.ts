import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";

test("250 Submissions: page selection, all results, exclusions, new arrivals and batched deletion", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  const name = "Bulk QA " + testInfo.project.name + "-" + Date.now();
  const response = await page.request.post("/api/admin/v1/sources", {
    data: { type: "one-shot", name },
    headers: { origin: "http://localhost:3100" },
  });
  expect(response.status()).toBe(201);
  const source = await response.json();
  const database = new Database("/tmp/forman-e2e.sqlite");
  database.pragma("busy_timeout = 5000");
  const insert = database.prepare("INSERT INTO submission (id, source_id, payload_json, created_at) VALUES (?, ?, ?, ?)");
  const prefix = "bulk-" + testInfo.project.name + "-" + Date.now();
  const createdAt = Date.now() - 60_000;
  database.transaction(() => {
    for (let i = 0; i < 250; i++) insert.run(prefix + "-" + i, source.id, '{"note":["bulk test"]}', createdAt + i);
  })();

  try {
    await page.goto("/app/submissions?sourceId=" + source.id + "&size=100");
    const table = page.getByRole("table", { name: "Submissions" });
    const top = page.getByRole("group", { name: "Top table controls" });
    const bottom = page.getByRole("group", { name: "Bottom table controls" });
    const selectPage = table.getByRole("checkbox", { name: "Select submissions on this page", exact: true });
    await expect(table.getByRole("row")).toHaveCount(101);
    // Keep the table mounted during a deliberately slow search, in both themes.
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.setAttribute("data-mantine-color-scheme", value), theme);
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/admin/v1/submissions?**", async route => {
        await gate;
        await route.continue();
      });
      const search = page.getByRole("textbox", { name: "Search", exact: true });
      const before = await table.boundingBox();
      await search.fill(theme === "light" ? "bulk" : "test");
      await expect(selectPage).toBeDisabled();
      await expect(table.getByRole("row")).toHaveCount(101);
      await expect(page.getByLabel("Updating Submissions")).toBeVisible();
      await expect(search).toBeFocused();
      const during = await table.boundingBox();
      expect(during?.y).toBe(before?.y);
      release();
      await expect(selectPage).toBeEnabled();
      await expect(page.getByLabel("Updating Submissions")).toHaveCount(0);
      await page.unroute("**/api/admin/v1/submissions?**");
    }
    await page.getByRole("textbox", { name: "Search", exact: true }).fill("");
    await expect(page).not.toHaveURL(/search=/);
    await expect(selectPage).toBeEnabled();
    await selectPage.check();
    await expect(top.getByText("100 selected", { exact: true })).toBeVisible();
    await expect(bottom.getByText("100 selected", { exact: true })).toBeVisible();
    await top.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(selectPage).not.toBeChecked();
    await expect(top.getByText("100 selected", { exact: true })).toBeVisible();
    await selectPage.check();
    await expect(top.getByText("200 selected", { exact: true })).toBeVisible();
    await top.getByRole("button", { name: "Select all 250", exact: true }).click();
    await expect(top.getByText("250 selected", { exact: true })).toBeVisible();
    const excluded = await table.getByRole("checkbox").nth(1).getAttribute("aria-label");
    await table.getByRole("checkbox").nth(1).uncheck();
    await expect(top.getByText("249 selected", { exact: true })).toBeVisible();
    await top.getByRole("button", { name: "3", exact: true }).click();
    await expect(table.getByRole("row")).toHaveCount(51);
    await expect(selectPage).toBeChecked();
    insert.run(prefix + "-new", source.id, "{}", Date.now());

    const batches: number[] = [];
    let failSecondBatch = true;
    await page.route("**/api/admin/v1/submissions", async route => {
      if (route.request().method() !== "DELETE") return route.continue();
      if (batches.length === 1 && failSecondBatch) {
        failSecondBatch = false;
        return route.fulfill({ status: 500, json: { error: "Test interruption" } });
      }
      const result = await route.fetch();
      batches.push((await result.json()).deleted);
      await route.fulfill({ response: result });
    });
    await bottom.getByRole("button", { name: "Delete selected" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("249 Submissions");
    await expect(dialog).toContainText(name);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(top.getByText("249 selected", { exact: true })).toBeVisible();
    await top.getByRole("button", { name: "Delete selected" }).click();
    await dialog.getByRole("button", { name: "Delete selected" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Deletion interrupted");
    await expect(dialog).toContainText("100 deleted");
    await dialog.getByRole("button", { name: "Delete selected" }).click();
    await expect(dialog).not.toBeVisible();
    expect(batches).toEqual([100, 100, 49]);
    const survivors = database.prepare("SELECT id FROM submission WHERE source_id = ? ORDER BY id").all(source.id) as { id: string }[];
    expect(survivors.map(r => r.id).sort()).toEqual([excluded!.replace("Select submission ", ""), prefix + "-new"].sort());
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(top.getByText(/selected/)).toHaveCount(0);

    // A filter change cancels selection; navigating pages above preserved it.
    await selectPage.check();
    await page.getByRole("textbox", { name: "Search", exact: true }).fill("no match");
    await expect(page.getByText("No Submissions match these filters")).toBeVisible();
    await page.getByRole("textbox", { name: "Search", exact: true }).fill("");
    await expect(table).toBeVisible();
    await expect(selectPage).not.toBeChecked();
  } finally {
    database.close();
  }
});
