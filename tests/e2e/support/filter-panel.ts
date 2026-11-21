import { expect, type Page } from "@playwright/test";

/** Phones keep collection filters behind a "Filters" toggle; open it when present. */
export async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filters( \(\d+\))?$/ });
  const apply = page.getByRole("button", { name: "Apply filters" });
  // Wait until the collection has rendered either the phone toggle or the open panel;
  // checking immediately races the loading skeleton and skips the toggle.
  await expect(toggle.or(apply).first()).toBeVisible();
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(apply).toBeVisible();
}

/** Filters are reachable without scrolling: the panel on wide screens, its toggle on phones. */
export async function expectFiltersReachable(page: Page, width: number) {
  await expect(
    width < 768
      ? page.getByRole("button", { name: /^Filters( \(\d+\))?$/ })
      : page.getByRole("button", { name: "Apply filters" }),
  ).toBeInViewport();
}
