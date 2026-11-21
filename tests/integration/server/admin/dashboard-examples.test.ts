import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "../../../helpers/database";
import { createAdminExamplesHandler } from "@/server/admin/examples-handler";
import { createPageViewModel } from "@/server/pages/page-view-model";
import { findPageByPublicId } from "@/server/pages/page-service";
import { createSession } from "@/server/auth/sessions";
import { createExample, processExample } from "@/server/dashboard/examples";
import {
  sources,
  pages,
  pipelines,
  pipelineActions,
  pipelineRuns,
  submissions,
  sourceSessions,
  configuredInboxItems,
} from "@/server/db/schema";

const databases: ReturnType<typeof createTestDatabase>[] = [];
beforeEach(() => {
  vi.stubEnv("FORMAN_BASE_ORIGIN", "https://forman.test");
  vi.stubEnv("FORMAN_DATABASE_PATH", ":memory:");
  vi.stubEnv(
    "FORMAN_SESSION_SECRET",
    "test-session-secret-at-least-32-characters",
  );
  vi.stubEnv(
    "FORMAN_ALTCHA_SECRET",
    "test-altcha-secret-at-least-32-characters",
  );
});
afterEach(() => {
  databases.splice(0).forEach((db) => db.dispose());
  vi.unstubAllEnvs();
});
function database() {
  const db = createTestDatabase();
  databases.push(db);
  return db;
}

describe("Dashboard examples", () => {
  test.each(["form", "survey"] as const)(
    "creates a complete %s with a real Inbox result",
    async (kind) => {
      const { db } = database();
      const result = createExample(db, { kind, requestId: randomUUID() });
      expect(result.name).toBe(
        kind === "form" ? "Example Form 1" : "Example Survey 1",
      );
      expect(db.select().from(sources).all()).toHaveLength(1);
      expect(db.select().from(pages).get()?.enabled).toBe(true);
      const page = await findPageByPublicId(db, result.pageId);
      expect(page?.altchaEnabled).toBe(true);
      const model = createPageViewModel({
        mode: page!.fieldDefinitionMode!,
        source: page!.fieldDefinitionSource!,
        presentation: page!.presentation,
      });
      expect(model.fields.map((field) => field.name)).toEqual(
        kind === "survey"
          ? ["name", "rating", "comment"]
          : ["name", "email", "organization", "note"],
      );
      if (kind === "survey")
        expect(model.fields.map((field) => field.page)).toEqual([1, 2, 2]);
      expect(db.select().from(pipelines).get()?.enabled).toBe(true);
      expect(db.select().from(pipelineActions).get()?.type).toBe("inbox");
      expect(db.select().from(submissions).all()).toHaveLength(1);
      if (kind === "survey")
        expect(db.select().from(sourceSessions).get()).toMatchObject({
          status: "completed",
          submissionId: result.submissionId,
        });
      expect(await processExample(db, result)).toBe("completed");
      expect(db.select().from(configuredInboxItems).get()).toMatchObject({
        sourceId: result.sourceId,
        submissionId: result.submissionId,
      });
      expect(db.select().from(pipelineRuns).get()?.status).toBe("completed");
    },
  );

  test("replaying a request never duplicates the example or sample response", async () => {
    const { db } = database();
    const input = { kind: "form" as const, requestId: randomUUID() };
    const first = createExample(db, input);
    expect(createExample(db, input)).toEqual(first);
    await processExample(db, first);
    await processExample(db, first);
    expect(db.select().from(sources).all()).toHaveLength(1);
    expect(db.select().from(submissions).all()).toHaveLength(1);
    expect(db.select().from(configuredInboxItems).all()).toHaveLength(1);
    expect(createExample(db, { ...input, requestId: randomUUID() }).name).toBe(
      "Example Form 2",
    );
  });

  test("processing one example leaves other pending runs untouched", async () => {
    const { db } = database();
    const first = createExample(db, { kind: "form", requestId: randomUUID() });
    const second = createExample(db, {
      kind: "survey",
      requestId: randomUUID(),
    });
    await processExample(db, second);
    expect(
      db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.id, first.runId))
        .get()?.status,
    ).toBe("pending");
    expect(db.select().from(configuredInboxItems).all()).toHaveLength(1);
  });

  test("a failed insert rolls the whole graph back", () => {
    const { db, client } = database();
    client.exec(
      "CREATE TRIGGER reject_example BEFORE INSERT ON page BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    );
    expect(() =>
      createExample(db, { kind: "form", requestId: randomUUID() }),
    ).toThrow();
    for (const table of [
      sources,
      pipelines,
      pipelineActions,
      pages,
      submissions,
    ]) {
      expect(db.select().from(table).all()).toHaveLength(0);
    }
  });
});

test("requires administrator authentication and validates the request", async () => {
  const { db } = database();
  const handler = createAdminExamplesHandler({ database: db });
  const token = await createSession(db);
  const request = (body: unknown, cookie?: string) =>
    new Request("https://forman.test/api/admin/v1/examples", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  expect(
    (await handler.create(request({ kind: "form", requestId: randomUUID() })))
      .status,
  ).toBe(401);
  expect(
    (
      await handler.create(
        request(
          { kind: "unknown", requestId: randomUUID() },
          "__Host-forman_session=" + token,
        ),
      )
    ).status,
  ).toBe(400);
  const response = await handler.create(
    request(
      { kind: "form", requestId: randomUUID() },
      "__Host-forman_session=" + token,
    ),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    sampleStatus: "completed",
    name: "Example Form 1",
  });
});

test("reports failed sample processing without losing the created example", async () => {
  const { db, client } = database();
  const result = createExample(db, { kind: "form", requestId: randomUUID() });
  client.exec("UPDATE pipeline_action_run SET maximum_attempts=1");
  client.exec(
    "CREATE TRIGGER reject_inbox BEFORE INSERT ON inbox_item BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  expect(await processExample(db, result)).toBe("failed");
  expect(db.select().from(pages).get()?.enabled).toBe(true);
  expect(db.select().from(submissions).all()).toHaveLength(1);
  expect(db.select().from(configuredInboxItems).all()).toHaveLength(0);
});
