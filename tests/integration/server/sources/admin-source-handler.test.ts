import { afterEach, describe, expect, test } from "vitest";

import { createAdminSourcesHandler } from "@/server/sources/admin-source-handler";
import { createSession } from "@/server/auth/sessions";
import { pipelines, submissions } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("admin sources handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("creates an immediately active Source for an authenticated administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const handler = createAdminSourcesHandler({ database: database.db });

    const response = await handler.create(
      new Request("https://forman.example.test/api/admin/v1/sources", {
        method: "POST",
        headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Product feedback", type: "one-shot" }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      name: "Product feedback",
      enabled: true,
      sourceId: expect.stringMatching(/^[abcdefghjkmnpqrstuvwxyz023456789]{10}$/),
    });
  });

  test("rejects unauthenticated Source creation", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    const response = await createAdminSourcesHandler({ database: database.db }).create(
      new Request("https://forman.example.test/api/admin/v1/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "No session", type: "one-shot" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  test("rejects a friendly name that is already in use", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    await createSource(database.db, { name: "Product feedback", type: "one-shot" });

    const response = await createAdminSourcesHandler({ database: database.db }).create(
      new Request("https://forman.example.test/api/admin/v1/sources", {
        method: "POST",
        headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "PRODUCT FEEDBACK", type: "one-shot" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "A Source with this name already exists" });
  });

  test("lists sources for an authenticated administrator", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);
    const form = await createSource(database.db, { name: "Feedback", type: "one-shot" });
    const recent = new Date(Date.now() - 86_400_000);
    const old = new Date(Date.now() - 60 * 86_400_000);
    database.db.insert(pipelines).values({
      createdAt: recent,
      enabled: true,
      sourceId: form.id,
      id: "pipeline-1",
      name: "Notify sales",
      updatedAt: recent,
    }).run();
    database.db.insert(submissions).values([
      {
        createdAt: recent,
        sourceId: form.id,
        id: "submission-recent",
        payloadJson: '{"email":"recent@example.test"}',
      },
      {
        createdAt: old,
        sourceId: form.id,
        id: "submission-old",
        payloadJson: '{"email":"old@example.test"}',
      },
    ]).run();

    const response = await createAdminSourcesHandler({ database: database.db }).list(
      new Request("https://forman.example.test/api/admin/v1/sources", {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{
        pipelineCount: 1,
        enabled: true,
        lastSubmission: {
          createdAt: recent.toISOString(),
          id: "submission-recent",
        },
        name: "Feedback",
        submissionsLast30Days: 1,
      }],
    });
  });
});
