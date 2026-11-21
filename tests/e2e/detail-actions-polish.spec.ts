import { expect, test } from "@playwright/test";

test("detail actions preserve state gates, pending feedback and focus", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  let state = "draft";
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  await page.route(
    "**/api/admin/v1/submissions/ui-submission",
    async (route) => {
      if (route.request().method() === "DELETE") {
        await gate;
        await route.fulfill({ status: 500, json: { error: "Test failure" } });
        return;
      }
      await route.fulfill({
        json: {
          id: "ui-submission",
          createdAt: "2026-09-22T12:00:00Z",
          sourceId: "source",
          sourcePublicId: "public",
          sourceName: "Contact",
          type: "session",
          state,
          payload: { message: "Preview" },
          pipelineRuns: [],
          tags: [],
          userAgent: null,
          referer: null,
        },
      });
    },
  );
  await page.goto(
    "/app/submissions/ui-submission?returnTo=%2Fapp%2Fsubmissions%3Fpage%3D2",
  );
  const trigger = page.getByRole("button", {
    name: "Submission actions",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("menuitem", { name: "Delete permanently" }),
  ).toBeDisabled();
  state = "completed";
  await page.reload();
  await trigger.press("Enter");
  await page.getByRole("menuitem", { name: "Delete permanently" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Delete Submission?",
  });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    dialog.getByRole("button", { name: "Deleting…" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  complete();
  await expect(dialog.getByRole("alert")).toContainText("could not be deleted");
  await page.screenshot({ path: testInfo.outputPath("submission-error.png") });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Back to all Submissions" }),
  ).toHaveAttribute("href", "/app/submissions?page=2");

  let inboxState = "read";
  await page.route("**/api/admin/v1/inbox/ui-item", async (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toEqual({ action: "unread" });
      inboxState = "unread";
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      json: {
        id: "ui-item",
        sourceId: "source",
        sourcePublicId: "public",
        sourceName: "Contact",
        actionName: "Customer enquiry",
        payloadJson: "{}",
        createdAt: "2026-09-22T12:00:00Z",
        state: inboxState,
        tags: [],
        trashedAt: null,
        submissionId: "ui-submission",
      },
    });
  });
  await page.goto("/app/inbox/ui-item");
  await page.getByRole("button", { name: "Inbox item actions" }).click();
  await page.getByRole("menuitem", { name: "Mark as unread" }).click();
  await page.getByRole("button", { name: "Inbox item actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Mark as read" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Archive", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move to Trash" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath("inbox-actions.png") });

  await page.route("**/api/admin/v1/pipelines", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "ui-pipeline",
            name: "Contact processing",
            sourceId: "public",
            sourceName: "Contact",
            enabled: true,
            steps: [],
            tags: [],
          },
        ],
      },
    }),
  );
  await page.goto("/app/pipelines");
  await page
    .getByRole("button", { name: "Actions for Contact processing" })
    .press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "View Pipeline Runs" }),
  ).toHaveAttribute("href", "/app/pipelines/ui-pipeline/runs");
  const box = await page.getByRole("menu").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
