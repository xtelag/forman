import { expect, test } from "@playwright/test";

test("tag badges and boolean values fit both themes", async ({
  page,
}, info) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const tags = [
    "rose",
    "coral",
    "peach",
    "amber",
    "lemon",
    "mint",
    "emerald",
    "teal",
    "sky",
    "blue",
    "indigo",
    "violet",
    "fuchsia",
  ].map((color) => ({ id: color, color, name: color + " team" }));
  tags.push({
    id: "long",
    color: "blue",
    name: "Customer follow-up with a very long descriptive tag name",
  });
  await page.route("**/api/admin/v1/inbox/ui-badges", (route) =>
    route.fulfill({
      json: {
        id: "ui-badges",
        sourceId: "source",
        sourcePublicId: "public",
        sourceName: "Contact",
        actionName: "Badge preview",
        payloadJson: JSON.stringify({ approved: true, archived: false }),
        createdAt: "2026-09-22T12:00:00Z",
        state: "read",
        tags,
        trashedAt: null,
        submissionId: "ui-submission",
      },
    }),
  );
  await page.goto("/app/inbox/ui-badges");
  await expect(page.getByText("Yes", { exact: true })).toBeVisible();
  await expect(page.getByText("No", { exact: true })).toBeVisible();
  await expect(page.getByText("rose team", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("badges-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("badges-dark.png"),
    fullPage: true,
  });
});
