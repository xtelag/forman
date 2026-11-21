import { expect, test } from "@playwright/test";
import axe from "axe-core";

test("admin controls fit narrow screens and remain accessible in both themes", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  async function audit(label: string) {
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async () =>
      (window as unknown as { axe: typeof axe }).axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    await info.attach(label, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
    expect
      .soft(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        label,
      )
      .toEqual([]);
  }
  await page.goto("/login");
  await audit("login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  await page.route("**/api/admin/v1/inbox/ui-accessibility", (route) =>
    route.fulfill({
      json: {
        id: "ui-accessibility",
        sourceId: "source",
        sourcePublicId: "public",
        sourceName: "Customer support",
        actionName: "Customer enquiry",
        preview: "A detailed customer enquiry for the support team.",
        payloadJson: JSON.stringify({
          ["field" + "x".repeat(80)]: "Imported field with a long identifier",
          attachments: [
            {
              url: "https://example.test/" + "reference".repeat(25),
              notes: ["First line\nSecond line", null],
            },
          ],
          email: "customer@example.test",
          approved: true,
          comment: "A detailed customer enquiry for the support team.",
        }),
        createdAt: "2026-09-22T12:00:00Z",
        state: "read",
        tags: [
          { id: "priority", name: "Priority", color: "amber" },
          { id: "support", name: "Support", color: "blue" },
        ],
        trashedAt: null,
        submissionId: "ui-submission",
      },
    }),
  );
  await page.goto("/app/inbox/ui-accessibility");
  await expect(
    // Inbox items are titled by their preview, not by the shared Action name.
    page.getByRole("heading", {
      name: "A detailed customer enquiry for the support team.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Imported field with a long identifier", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("https://example.test/" + "reference".repeat(25), {
      exact: true,
    }),
  ).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const controls = await Promise.all(
      ["Toggle navigation", "Switch to dark theme", "Log out"].map((name) =>
        page.getByRole("button", { name, exact: true }).boundingBox(),
      ),
    );
    for (const box of controls) {
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const logo = await page.getByTestId("forman-wordmark").boundingBox();
    expect(logo!.x + logo!.width).toBeLessThanOrEqual(controls[1]!.x);
    const toolbar = page.getByTestId("inbox-action-toolbar");
    const boxes = await toolbar
      .locator("button:visible,a:visible")
      .evaluateAll((elements) =>
        elements.map((el) => el.getBoundingClientRect().toJSON()),
      );
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width !== 390) {
      await audit("inbox-light-" + width);
      await page
        .getByRole("button", { name: "Switch to dark theme" })
        .press("Enter");
      await expect(
        page.getByRole("button", { name: "Switch to light theme" }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect(page.locator("html")).toHaveAttribute(
        "data-mantine-color-scheme",
        "dark",
      );
      await audit("inbox-dark-" + width);
      await page.screenshot({
        path: info.outputPath("inbox-dark-" + width + ".png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Switch to light theme" })
        .press("Enter");
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await expect(page.locator("html")).toHaveAttribute(
        "data-mantine-color-scheme",
        "light",
      );
    }
  }
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await audit("settings");
  await page.goto("/app/sources");
  await page
    .getByRole("button", { name: "Create Source", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create Source" }),
  ).toBeVisible();
  await audit("create-source");
});
