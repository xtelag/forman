import { expect, test } from "@playwright/test";

test("callback links reveal the matching action and retry feedback stays local", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const now = "2026-09-22T10:00:00Z";
  const longValue = "long-value-".repeat(80);
  const failed = {
    id: "failed-action",
    position: 1,
    name: "Notify sales",
    type: "email",
    status: "failed",
    attemptCount: 3,
    maximumAttempts: 3,
    errorSummary: "Connection refused: " + longValue,
    inputPayload: { message: longValue },
    outputPayload: null,
    callbackExpiresAt: null,
    nextAttemptAt: null,
    updatedAt: now,
  };
  const waiting = {
    ...failed,
    id: "waiting-action",
    position: 2,
    name: "Confirm address",
    type: "email_confirmation",
    status: "waiting_callback",
    errorSummary: null,
    callbackExpiresAt: "2026-09-23T10:00:00Z",
  };
  const transformed = {
    ...failed,
    id: "transformed-action",
    position: 3,
    name: "Transform data",
    type: "transformation",
    status: "completed",
    attemptCount: 1,
    errorSummary: null,
    outputPayload: { message: longValue, verified: true },
  };
  let retried = false;
  await page.route("**/api/admin/v1/pipeline-runs/run-test", (route) =>
    route.fulfill({
      json: {
        id: "run-test",
        pipelineName: "Customer workflow",
        createdAt: now,
        updatedAt: now,
        status: "processing",
        actions: [
          {
            ...failed,
            status: retried ? "retry_scheduled" : "failed",
            errorSummary: retried ? null : failed.errorSummary,
            nextAttemptAt: retried ? "2026-09-22T10:02:00Z" : null,
          },
          waiting,
          transformed,
        ],
      },
    }),
  );
  for (const path of ["sources", "pipelines", "tags"])
    await page.route("**/api/admin/v1/" + path, (route) =>
      route.fulfill({ json: { items: [] } }),
    );
  await page.route("**/api/admin/v1/callbacks*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "waiting-action",
            runId: "run-test",
            actionName: "Confirm address",
            actionType: "email_confirmation",
            pipelineId: null,
            pipelineName: "Customer workflow",
            sourceId: "source-test",
            sourceName: "Contact form",
            waitingSince: now,
            callbackExpiresAt: "2026-09-23T10:00:00Z",
          },
        ],
        total: 1,
      },
    }),
  );
  let attempts = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/admin/v1/pipelines/runs/failed-action/retry",
    async (route) => {
      attempts++;
      if (attempts === 1) {
        await pending;
        await route.fulfill({ status: 409, json: { error: "State changed" } });
      } else {
        retried = true;
        await route.fulfill({ json: { actionRunId: "failed-action" } });
      }
    },
  );
  await page.goto("/app/callbacks");
  await page.getByRole("button",{name:"Actions for Callback waiting-action",exact:true}).filter({visible:true}).click();
  await page.getByRole("menuitem",{name:"Open waiting Action",exact:true}).click();
  await expect(page).toHaveURL(
    /\/app\/pipeline-runs\/run-test#waiting-action$/,
  );
  const callback = page.getByRole("button", { name: /2\. Confirm address/ });
  await expect(callback).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Confirmation expires", { exact: true }),
  ).toBeVisible();
  const action = page.getByRole("button", { name: /1\. Notify sales/ });
  await action.click();
  await expect(page.getByText("Sent payload", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Retry Action", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retrying…", exact: true }),
  ).toBeDisabled();
  await action.click();
  release();
  await expect(action).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Action could not be retried. It may have changed state.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry Action", exact: true }).click();
  await expect(action).toContainText("Retry scheduled");
  await expect(page.getByText("Next retry", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByRole("button", { name: /3\. Transform data/ }).click();
  const output = page.getByLabel("Output payload JSON", { exact: true });
  await expect(output).toContainText('"verified": true');
  await expect(output).toBeVisible();
  await expect(
    page.getByRole("region", { name: /3\. Transform data/ }),
  ).toHaveCSS("overflow", "visible");
  await output.focus();
  await expect(output).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("run-details.png"),
    fullPage: true,
  });
});
