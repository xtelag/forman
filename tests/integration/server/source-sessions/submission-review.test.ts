import { afterEach, expect, test } from "vitest";
import { createTestDatabase } from "../../../helpers/database";
import { createSource } from "@/server/sources/source-service";
import { createSession } from "@/server/auth/sessions";
import { sourceSessions, submissions } from "@/server/db/schema";
import { createAdminSubmissionsHandler } from "@/server/submissions/admin-submissions-handler";
const databases: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => databases.splice(0).forEach(database => database.dispose()));
test("unifies drafts and accepted submissions, filters and deletes only eligible records", async () => {
  const database = createTestDatabase(); databases.push(database);
  const source = await createSource(database.db, { type: "session", name: "Survey" });
  const directSource = await createSource(database.db, { type: "one-shot", name: "Contact" });
  const now = new Date();
  database.db.insert(submissions).values([
    { id: "direct", sourceId: directSource.id, payloadJson: '{"answer":"direct"}', createdAt: now },
    { id: "final", sourceId: source.id, payloadJson: '{"answer":"final"}', sessionUpdateCount: 2, sessionRequestCount: 3, createdAt: now },
  ]).run();
  database.db.insert(sourceSessions).values([
    { id: "draft", sourceId: source.id, createdAt: now, updatedAt: now, keyHash: "secret-draft", payloadJson: '{"answer":"draft"}', expiresAt: new Date(Date.now() + 86400000) },
    { id: "done", sourceId: source.id, createdAt: now, updatedAt: now, keyHash: "secret-done", status: "completed", submissionId: "final", expiresAt: new Date(Date.now() + 86400000) },
    { id: "expired", sourceId: source.id, createdAt: now, updatedAt: now, keyHash: "secret-expired", expiresAt: new Date(0) },
  ]).run();
  const handler = createAdminSubmissionsHandler({ database: database.db });
  const cookie = `__Host-forman_session=${await createSession(database.db)}`;
  const request = (query = "") => new Request(`https://forman.test/api/admin/v1/submissions${query}`, { headers: { cookie } });
  expect((await handler.list(new Request("https://forman.test/api/admin/v1/submissions"))).status).toBe(401);
  const all = await (await handler.list(request())).json();
  expect(all.total).toBe(4);
  expect(all.deletableTotal).toBe(2);
  const sourceMatches = await (await handler.list(request("?search=Survey"))).json();
  expect(sourceMatches.total).toBe(3);
  expect(sourceMatches.deletableTotal).toBe(1);
  expect(sourceMatches.items.map((item: { state: string }) => item.state).sort()).toEqual(["completed", "draft", "expired"]);

  expect(all.items.filter((item: { type: string }) => item.type === "session")).toHaveLength(3);
  expect(JSON.stringify(all)).not.toContain("secret-");
  expect((await (await handler.list(request(`?sourceId=${source.id}`))).json()).total).toBe(3);
  expect((await (await handler.list(request("?sourceId=missing"))).json()).total).toBe(0);
  expect((await (await handler.list(request("?tagId=missing"))).json()).total).toBe(0);
  expect((await (await handler.list(request("?from=2099-01-01"))).json()).total).toBe(0);
  expect((await (await handler.get(request(), "session-done")).json()).id).toBe("final");
  const draft = await (await handler.list(request("?type=session&state=draft&search=draft"))).json();
  expect(draft.total).toBe(1);
  const detail = await (await handler.get(request(), draft.items[0].id)).json();
  expect(detail.payload).toEqual({ answer: "draft" });
  expect(detail.pipelineRuns).toEqual([]);
  expect((await handler.delete(request(), draft.items[0].id)).status).toBe(404);
  expect((await (await handler.list(request("?type=one-shot&state=draft"))).json()).total).toBe(0);
  expect((await (await handler.list(request("?limit=1&offset=1"))).json()).items).toHaveLength(1);
  const expired = await (await handler.list(request("?state=expired"))).json();
  expect(expired.items[0].payload).toEqual({});
  const deleted = await handler.remove(new Request("https://forman.test/api/admin/v1/submissions", { method: "DELETE", headers: { cookie }, body: JSON.stringify({ type: "filter", filter: { type: "session" }, excludedIds: [], snapshotBefore: new Date(Date.now() + 1000).toISOString() }) }));
  expect(await deleted.json()).toEqual({ deleted: 1, hasMore: false });
  const remaining = await (await handler.list(request())).json();
  expect(remaining.total).toBe(3);
  expect(remaining.items.some((item: { id: string }) => item.id === "direct")).toBe(true);
  expect(database.db.select().from(sourceSessions).all()).toHaveLength(3);
});
