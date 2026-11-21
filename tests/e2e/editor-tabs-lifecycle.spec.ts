import { test, expect } from "@playwright/test";
import { ensureE2eRateLimits } from "./support/rate-limits";

test("editor tabs reset on visits, preserve saves, and reveal deep links and late errors", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);
  const source = await (
    await page.request.post("/api/admin/v1/sources", {
      headers: { origin: "http://localhost:3100" },
      data: { name: `Accordion ${testInfo.project.name}`, type: "one-shot" },
    })
  ).json();
  const path = `/app/sources/${source.sourceId}`;
  await page.goto(path);
  const configuration = page
    .getByRole("tab", { name: "Configuration", exact: true })
    .last();
  const sections = page.locator('main [role="tab"]');
  await expect(configuration).toHaveAttribute("aria-selected", "true");
  expect(
    await sections.evaluateAll(
      (nodes) =>
        nodes.filter((n) => n.getAttribute("aria-selected") === "true").length,
    ),
  ).toBe(1);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(`Renamed ${testInfo.project.name}`);
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save configuration", exact: true }),
  ).toBeDisabled();
  await expect(configuration).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(configuration).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("link", { name: "Back to all Sources", exact: true })
    .click();
  await page
    .getByText(`Renamed ${testInfo.project.name}`, { exact: true })
    .filter({ visible: true })
    .click();
  await expect(configuration).toHaveAttribute("aria-selected", "true");
  await page.goto(`${path}#advanced-configuration`);
  await expect(
    page.getByRole("tab", { name: "Advanced", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await configuration.click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/admin/v1/sources/${source.sourceId}`,
    async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await pending;
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid settings" }),
      });
    },
  );
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Rejected edit");
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await page.getByRole("tab", { name: "Protection", exact: true }).click();
  await expect(configuration).toHaveAttribute("aria-selected", "false");
  release();
  await expect(configuration).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Rejected edit");
});
