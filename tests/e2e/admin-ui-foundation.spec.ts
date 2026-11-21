import { expect, test } from "@playwright/test";

const preview =
  "Customer request about a form submission with enough detail to remain readable on a laptop";

test("Inbox keeps filters and record actions reachable across viewport sizes", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page.getByLabel("Password").fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  await page.route("**/api/admin/v1/inbox?*", (route) =>
    route.fulfill({
      json: {
        total: 1,
        items: [
          {
            id: "ux-inbox-1",
            createdAt: "2026-09-20T10:30:00.000Z",
            sourceId: "ux-source-1",
            sourcePublicId: "ux-source",
            preview,
            actionName: "Customer support",
            sourceName: "Contact form",
            state: "unread",
            tags: [
              { id: "one", name: "Support", color: "blue" },
              { id: "two", name: "Customer", color: "emerald" },
              { id: "three", name: "Follow up", color: "violet" },
            ],
            trashedAt: null,
          },
        ],
      },
    }),
  );
  await page.goto("/app/inbox?state=unread");
  await expect(
    page.getByText("Unread: " + preview, { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  for (const width of [1920, 1280, 1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 768) {
      // Phones keep filters behind a toggle so records stay above the fold.
      const toggle = page.getByRole("button", { name: /^Filters/ });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
    }
    await expect(
      page.getByRole("button", { name: "Apply filters" }),
    ).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
        message: `page overflow at ${width}px`,
      })
      .toBeLessThanOrEqual(width);
    const apply = await page
      .getByRole("button", { name: "Apply filters" })
      .boundingBox();
    expect(
      apply!.x + apply!.width,
      `filter action at ${width}px`,
    ).toBeLessThanOrEqual(width);
    if (width === 1920) {
      const tops = await page
        .getByRole("search")
        .locator('input:not([type="hidden"]), button')
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().top),
        );
      expect(
        Math.max(...tops) - Math.min(...tops),
        "Inbox filters share one row",
      ).toBeLessThan(2);
    }
    if (width >= 1024)
      await expect(page.getByRole("table", { name: "Inbox" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Toggle navigation" }).press("Enter");
  const navigation = page.getByRole("dialog", { name: "Navigation" });
  await expect(
    navigation.getByRole("link", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Close navigation", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Toggle navigation" }),
  ).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  const table = page.getByRole("table", { name: "Inbox" });
  const remainingTags = table.getByRole("button", {
    name: /^Show all \d+ tags$/,
  });
  await remainingTags.press("Enter");
  await expect(page.getByText("Follow up", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/inbox\?state=unread$/);
  await remainingTags.press("Escape");
  await table
    .getByRole("checkbox", { name: "Select inbox ux-inbox-1" })
    .check();
  await expect(page).toHaveURL(/\/app\/inbox\?state=unread$/);
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(table.getByRole("link")).toHaveCount(0);
  await table
    .getByRole("button", { name: "Actions for " + preview, exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Open Inbox item", exact: true }),
  ).toHaveAttribute("href", /returnTo=%2Fapp%2Finbox%3Fstate%3Dunread/);
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .locator("a[data-active]"),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await navigation
    .getByRole("link", { name: "Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL("/app");
  await expect(navigation).toBeHidden();
});
