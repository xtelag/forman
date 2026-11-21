import { test, expect } from "@playwright/test";
test("kebab menus preserve lifecycle, drafts and contextual availability", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/login");
  await page.getByLabel("Username").fill("forman");
  await page
    .getByLabel("Password", { exact: true })
    .fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/app");
  const headers = { origin: "http://localhost:3100" };
  const sourceResponse = await page.request.post("/api/admin/v1/sources", {
    headers,
    data: { name: "Kebab audit " + info.project.name, type: "one-shot" },
  });
  expect(sourceResponse.status()).toBe(201);
  const source = await sourceResponse.json();
  const sp = "/api/admin/v1/sources/" + source.sourceId;
  expect(
    (
      await page.request.patch(sp, {
        headers,
        data: { section: "protection", values: { altchaEnabled: false } },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.patch(sp, {
        headers,
        data: {
          section: "source-fields",
          values: {
            fieldDefinitionMode: "json-schema",
            fieldDefinitionSource: JSON.stringify({
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
              },
              required: ["name"],
              additionalProperties: false,
            }),
          },
        },
      })
    ).ok(),
  ).toBe(true);
  const pr = await page.request.post("/api/admin/v1/pipelines", {
    headers,
    data: {
      name: "Kebab pipeline " + info.project.name,
      sourceId: source.id,
      enabled: true,
      steps: [
        {
          name: "Audit Inbox",
          type: "inbox",
          enabled: true,
          configuration: {},
        },
      ],
    },
  });
  expect(pr.status()).toBe(201);
  const pipeline = await pr.json();
  expect(
    (
      await page.request.post("/api/submit/" + source.sourceId, {
        data: { name: "Kebab response" },
      })
    ).status(),
  ).toBe(202);
  let item!: { id: string; submissionId: string };
  await expect
    .poll(async () => {
      const data = await (
        await page.request.get("/api/admin/v1/inbox?sourceId=" + source.id)
      ).json();
      item = data.items[0];
      return Boolean(item);
    })
    .toBe(true);
  async function menu(trigger: string, action: string) {
    await page
      .getByRole("button", { name: trigger, exact: true })
      .filter({ visible: true })
      .click();
    await page.getByRole("menuitem", { name: action, exact: true }).click();
  }
  async function state() {
    return (
      await (await page.request.get("/api/admin/v1/inbox/" + item.id)).json()
    ).state;
  }
  const inbox = "/app/inbox?sourceId=" + source.id;
  const inboxTrigger = "Actions for Kebab response";
  await page.goto(inbox);
  await menu(inboxTrigger, "Mark as read");
  await expect.poll(state).toBe("read");
  await menu(inboxTrigger, "Mark as unread");
  await expect.poll(state).toBe("unread");
  await menu(inboxTrigger, "Archive");
  await expect.poll(state).toBe("archived");
  await menu(inboxTrigger, "Move to Inbox");
  await expect.poll(state).toBe("read");
  await menu(inboxTrigger, "Archive");
  await expect.poll(state).toBe("archived");
  await menu(inboxTrigger, "Open Inbox item");
  await page
    .getByRole("button", { name: "Inbox item actions", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Mark as unread", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(state).toBe("archived");
  await page.goto(inbox);
  await menu(inboxTrigger, "Move to Trash");
  await page.getByRole("tab", { name: "Trash", exact: true }).click();
  await menu(inboxTrigger, "Restore");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/admin/v1/inbox/" + item.id)
          ).json()
        ).trashedAt,
    )
    .toBeNull();
  await expect.poll(state).toBe("archived");
  await page.goto(inbox);
  await menu(inboxTrigger, "Move to Trash");
  await page.getByRole("tab", { name: "Trash", exact: true }).click();
  await menu(inboxTrigger, "Delete permanently");
  await page.getByRole("dialog").getByRole("button", {name:"Cancel",exact:true}).click();
  expect((await page.request.get("/api/admin/v1/inbox/"+item.id)).status()).toBe(200);
  await menu(inboxTrigger, "Delete permanently");
  await page.getByRole("dialog").getByRole("button", {name:"Delete permanently",exact:true}).click();
  await expect.poll(async () => (await page.request.get("/api/admin/v1/inbox/"+item.id)).status()).toBe(404);
  expect((await page.request.get("/api/admin/v1/submissions/"+item.submissionId)).status()).toBe(200);
  const formResponse = await page.request.post("/api/admin/v1/pages", {
    headers,
    data: { sourceId: source.id, name: "Kebab form " + info.project.name },
  });
  expect(formResponse.status()).toBe(201);
  const form = await formResponse.json();
  const formTrigger = "Actions for Built-in Form " + form.name;
  await page.goto("/app/pages");
  await menu(formTrigger, "Publish");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/admin/v1/pages/" + form.pageId)
          ).json()
        ).enabled,
    )
    .toBe(true);
  expect(
    (await page.request.patch(sp, { headers, data: { enabled: false } })).ok(),
  ).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: formTrigger, exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Open public form", exact: true }),
  ).toHaveAttribute("data-disabled", "true");
  expect((await page.request.get("/pages/" + form.pageId)).status()).toBe(404);
  await page.keyboard.press("Escape");
  expect(
    (await page.request.patch(sp, { headers, data: { enabled: true } })).ok(),
  ).toBe(true);
  await menu(formTrigger, "Unpublish");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Unpublish", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/admin/v1/pages/" + form.pageId)
          ).json()
        ).enabled,
    )
    .toBe(false);
  await page
    .getByRole("button", { name: formTrigger, exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Open public form", exact: true }),
  ).toHaveAttribute("data-disabled", "true");
  await page.keyboard.press("Escape");
  await menu(formTrigger, "Delete permanently");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    (await page.request.get("/api/admin/v1/pages/" + form.pageId)).status(),
  ).toBe(404);
  await page.goto("/app/pipelines/" + pipeline.id);
  await menu("Actions for Action 1", "Remove Action");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove Action", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/admin/v1/pipelines/" + pipeline.id)
          ).json()
        ).steps.length,
    )
    .toBe(0);
  await page.goto("/app/pipelines");
  const pt = "Actions for " + pipeline.name;
  await menu(pt, "Disable");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/admin/v1/pipelines/" + pipeline.id)
          ).json()
        ).enabled,
    )
    .toBe(false);
  await menu(pt, "Enable");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/admin/v1/pipelines/" + pipeline.id)
          ).json()
        ).enabled,
    )
    .toBe(true);
  await menu(pt, "Disable");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/admin/v1/pipelines/" + pipeline.id)
          ).json()
        ).enabled,
    )
    .toBe(false);
  await menu(pt, "Delete permanently");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    (await page.request.get("/api/admin/v1/pipelines/" + pipeline.id)).status(),
  ).toBe(404);
  const submissions = await (
    await page.request.get("/api/admin/v1/submissions?sourceId=" + source.id)
  ).json();
  await page.goto("/app/submissions?sourceId=" + source.id);
  await menu(
    "Actions for Submission " + submissions.items[0].id,
    "Delete permanently",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    (
      await page.request.get(
        "/api/admin/v1/submissions/" + submissions.items[0].id,
      )
    ).status(),
  ).toBe(404);
  await page.goto("/app/sources");
  const st = "Actions for " + source.name;
  await menu(st, "Deactivate");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/app/sources/" + source.sourceId);
  await page.route("**" + sp, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, json: { error: "Audit failure" } })
      : route.continue(),
  );
  await menu("Source actions", "Delete permanently");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(1);
  await expect(
    page.getByText("The Source could not be deleted. Try again.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.unroute("**" + sp);
  await page.goto("/app/sources");
  await menu(st, "Activate");
  await expect
    .poll(
      async () => (await (await page.request.get(sp)).json()).source.enabled,
    )
    .toBe(true);
  await menu(st, "Deactivate");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await menu(st, "Delete permanently");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect((await page.request.get(sp)).status()).toBe(404);
});
