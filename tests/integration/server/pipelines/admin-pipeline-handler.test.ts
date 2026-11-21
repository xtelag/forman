import { afterEach, describe, expect, test } from "vitest";

import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createAdminPipelinesHandler } from "@/server/pipelines/admin-pipelines-handler";
import { eq } from "drizzle-orm";
import { pipelineActions, pipelineRuns, pipelines, submissions } from "@/server/db/schema";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("configured Pipelines handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("lists configured Pipelines for an authenticated administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const session = await createSession(database.db);

    const response = await createAdminPipelinesHandler({
      database: database.db,
    }).list(
      new Request("https://forman.example.test/api/admin/v1/pipelines", {
        headers: { cookie: `__Host-forman_session=${session}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });
  });

  test("creates Pipeline configuration and changes one Action through focused operations", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const session = await createSession(database.db);
    const handler = createAdminPipelinesHandler({ database: database.db });
    const headers = { "content-type": "application/json", cookie: `__Host-forman_session=${session}` };

    const created = await handler.createConfiguration(new Request("https://forman.example.test/api/admin/v1/pipelines", {
      body: JSON.stringify({ name: "Contact processing", sourceId: source.id }), headers, method: "POST",
    }));
    expect(created.status).toBe(201);
    const pipeline = await created.json() as { id: string; steps: Array<{ id: string; name: string }> };
    expect(pipeline.steps).toEqual([]);

    const actionResponse = await handler.createAction(pipeline.id, new Request("https://forman.example.test/api/admin/v1/pipelines/id/actions", {
      body: JSON.stringify({ name: "Store", type: "inbox" }), headers, method: "POST",
    }));
    expect(actionResponse.status).toBe(201);
    const withAction = await actionResponse.json() as { steps: Array<{ id: string; name: string }> };
    expect(withAction.steps).toMatchObject([{ name: "Store" }]);

    const actionId = withAction.steps[0]!.id;
    const updated = await handler.updateAction(pipeline.id, actionId, new Request("https://forman.example.test/api/admin/v1/pipelines/id/actions/action", {
      body: JSON.stringify({ name: "Archive", type: "inbox" }), headers, method: "PATCH",
    }));
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ steps: [{ id: actionId, name: "Archive" }] });
  });

  test("creates an ordered Pipeline with Actions for one Data Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const session = await createSession(database.db);

    const response = await createAdminPipelinesHandler({
      database: database.db,
    }).create(
      new Request("https://forman.example.test/api/admin/v1/pipelines", {
        body: JSON.stringify({
          name: "Verify and notify",
          sourceId: source.id,
          steps: [
            { name: "Normalize name", type: "transformation" },
            {
              blocking: false,
              configuration: { url: "https://hooks.example.test/contact", method: "POST", authentication: "none" },
              conditionMissBehavior: "skip_remaining",
              maximumAttempts: 5,
              name: "Notify CRM",
              type: "webhook",
            },
          ],
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-forman_session=${session}`,
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      enabled: true,
      name: "Verify and notify",
      sourceId: source.id,
      sourceName: "Contact",
      steps: [
        {
          blocking: true,
          conditionMissBehavior: "skip_action",
          enabled: true,
          failurePolicy: "cancel",
          maximumAttempts: 3,
          name: "Normalize name",
          position: 1,
          type: "transformation",
        },
        {
          blocking: false,
          conditionMissBehavior: "skip_remaining",
          enabled: true,
          failurePolicy: null,
          maximumAttempts: 5,
          name: "Notify CRM",
          position: 2,
          type: "webhook",
        },
      ],
    });
  });

  test("stores type-specific Action configuration after validating it", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const session = await createSession(database.db);

    const response = await createAdminPipelinesHandler({
      database: database.db,
    }).create(
      new Request("https://forman.example.test/api/admin/v1/pipelines", {
        body: JSON.stringify({
          name: "Process contact",
          sourceId: source.id,
          steps: [
            {
              configuration: { expression: '{ "email": payload.email }' },
              name: "Normalize payload",
              type: "transformation",
            },
            {
              configuration: { url: "https://hooks.example.test/contact", method: "POST", authentication: "none" },
              name: "Notify CRM",
              type: "webhook",
            },
            {
              configuration: {
                timeoutSeconds: 86400,
                url: "https://verify.example.test/contact",
              },
              name: "Verify email",
              type: "callback",
            },
            {
              configuration: {
                field: "email.verified",
                timeoutSeconds: 86400,
                url: "https://verify.example.test/bool",
              },
              name: "Mark email verified",
              type: "callback_boolean",
            },
            {
              configuration: { recipients: ["team@example.test"] },
              name: "Notify team",
              type: "email",
            },
            { configuration: {}, name: "Archive", type: "inbox" },
          ],
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-forman_session=${session}`,
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(
      database.db.select({ configurationJson: pipelineActions.configurationJson })
        .from(pipelineActions)
        .all()
        .map((step) => JSON.parse(step.configurationJson)),
    ).toEqual([
      { expression: '{ "email": payload.email }' },
      { url: "https://hooks.example.test/contact", method: "POST", authentication: "none" },
      { timeoutSeconds: 86400, url: "https://verify.example.test/contact" },
      { field: "email.verified", timeoutSeconds: 86400, url: "https://verify.example.test/bool" },
      { recipients: ["team@example.test"] },
      {},
    ]);
  });

  test("returns one configured Pipeline with the editable Action configuration", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const session = await createSession(database.db);
    const handler = createAdminPipelinesHandler({ database: database.db });
    const created = await handler.create(
      new Request("https://forman.example.test/api/admin/v1/pipelines", {
        body: JSON.stringify({
          name: "Process contact",
          sourceId: source.id,
          steps: [{
            configuration: { expression: '{ "email": payload.email }' },
            name: "Normalize payload",
            type: "transformation",
          }],
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-forman_session=${session}`,
        },
        method: "POST",
      }),
    );
    const pipeline = await created.json() as { id: string };

    const response = await (handler as unknown as {
      get: (id: string, request: Request) => Promise<Response>;
    }).get(
      pipeline.id,
      new Request(`https://forman.example.test/api/admin/v1/pipelines/${pipeline.id}`, {
        headers: { cookie: `__Host-forman_session=${session}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: pipeline.id,
      name: "Process contact",
      sourceId: source.id,
      steps: [{
        configuration: { expression: '{ "email": payload.email }' },
        name: "Normalize payload",
      }],
    });
  });

  test("replaces Pipeline configuration without changing its identifier", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const session = await createSession(database.db);
    const handler = createAdminPipelinesHandler({ database: database.db });
    const created = await handler.create(
      new Request("https://forman.example.test/api/admin/v1/pipelines", {
        body: JSON.stringify({
          name: "Process contact",
          sourceId: source.id,
          steps: [{ name: "Normalize payload", type: "transformation" }],
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-forman_session=${session}`,
        },
        method: "POST",
      }),
    );
    const pipeline = await created.json() as { id: string };

    const response = await (handler as unknown as {
      update: (id: string, request: Request) => Promise<Response>;
    }).update(
      pipeline.id,
      new Request(`https://forman.example.test/api/admin/v1/pipelines/${pipeline.id}`, {
        body: JSON.stringify({
          name: "Notify the team",
          sourceId: source.id,
          steps: [{
            configuration: { recipients: ["team@example.test"] },
            name: "Send email",
            type: "email",
          }],
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-forman_session=${session}`,
        },
        method: "PUT",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: pipeline.id,
      name: "Notify the team",
      steps: [{ name: "Send email", type: "email" }],
    });
  });

  test("does not allow an existing Pipeline to be moved to another Data Source", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const contact = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const orders = await createSource(database.db, { type: "one-shot", name: "Orders" });
    const session = await createSession(database.db);
    const handler = createAdminPipelinesHandler({ database: database.db });
    const created = await handler.create(
      new Request("https://forman.example.test/api/admin/v1/pipelines", {
        body: JSON.stringify({
          name: "Process contact",
          sourceId: contact.id,
          steps: [{ name: "Normalize payload", type: "transformation" }],
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-forman_session=${session}`,
        },
        method: "POST",
      }),
    );
    const pipeline = await created.json() as { id: string };

    const response = await (handler as unknown as {
      update: (id: string, request: Request) => Promise<Response>;
    }).update(
      pipeline.id,
      new Request(`https://forman.example.test/api/admin/v1/pipelines/${pipeline.id}`, {
        body: JSON.stringify({
          name: "Process contact",
          sourceId: orders.id,
          steps: [{ name: "Normalize payload", type: "transformation" }],
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-forman_session=${session}`,
        },
        method: "PUT",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Pipeline" });
  });

  test("deletes only a disabled Pipeline without unfinished Runs and keeps Run history", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const session = await createSession(database.db);
    const handler = createAdminPipelinesHandler({ database: database.db });
    const now = new Date("2026-09-29T10:00:00.000Z");
    const request = (cookie?: string) => new Request("https://forman.example.test/api/admin/v1/pipelines/pipeline", {
      headers: cookie ? { cookie } : {}, method: "DELETE",
    });
    const cookie = `__Host-forman_session=${session}`;
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "pipeline", name: "Archive", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({
      blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, enabled: true,
      id: "action", maximumAttempts: 3, name: "Store", pipelineId: "pipeline", position: 1, type: "inbox", updatedAt: now,
    }).run();
    database.db.insert(submissions).values([
      { createdAt: now, id: "done", payloadJson: "{}", sourceId: source.id },
      { createdAt: now, id: "busy", payloadJson: "{}", sourceId: source.id },
    ]).run();
    database.db.insert(pipelineRuns).values([
      { createdAt: now, id: "run-done", pipelineId: "pipeline", pipelineName: "Archive", snapshotJson: "{}", sourceId: source.id, status: "completed", submissionId: "done", updatedAt: now },
      { createdAt: now, id: "run-busy", pipelineId: "pipeline", pipelineName: "Archive", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "busy", updatedAt: now },
    ]).run();

    expect((await handler.delete("pipeline", request())).status).toBe(401);
    expect((await handler.delete("missing", request(cookie))).status).toBe(404);

    const enabled = await handler.delete("pipeline", request(cookie));
    expect(enabled.status).toBe(409);
    await expect(enabled.json()).resolves.toEqual({ error: "Disable the Pipeline before deleting it." });

    database.db.update(pipelines).set({ enabled: false }).where(eq(pipelines.id, "pipeline")).run();
    const busy = await handler.delete("pipeline", request(cookie));
    expect(busy.status).toBe(409);
    await expect(busy.json()).resolves.toEqual({ error: "Wait until the Pipeline's Runs finish, then delete it." });

    database.db.update(pipelineRuns).set({ status: "completed" }).where(eq(pipelineRuns.id, "run-busy")).run();
    expect((await handler.delete("pipeline", request(cookie))).status).toBe(204);
    expect(database.db.select().from(pipelines).all()).toEqual([]);
    expect(database.db.select().from(pipelineActions).all()).toEqual([]);
    expect(database.db.select({ id: pipelineRuns.id, pipelineId: pipelineRuns.pipelineId }).from(pipelineRuns).all())
      .toEqual(expect.arrayContaining([{ id: "run-done", pipelineId: null }, { id: "run-busy", pipelineId: null }]));
  });
});
