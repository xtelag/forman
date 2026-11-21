import { afterEach, describe, expect, test } from "vitest";

import { createAdminSourceLifecycleHandler } from "@/server/sources/admin-source-lifecycle-handler";
import { createSession } from "@/server/auth/sessions";
import { sessionSettings } from "@/server/source-sessions/session-service";
import { createSource, findSourceBySourceId } from "@/server/sources/source-service";
import { runMigrations } from "@/server/db/migrate";
import { createTag, listTagsForSource } from "@/server/tags/tag-service";
import { createTestDatabase } from "../../../helpers/database";

describe("admin Source lifecycle handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("normalizes honeypot lists and rejects collisions when either protection or fields change", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, { name: "Protected", type: "one-shot" });
    const token = await createSession(database.db);
    const handler = createAdminSourceLifecycleHandler({ database: database.db });
    const update = (section: string, values: Record<string, unknown>) => handler.update(new Request("https://forman.example.test", {
      method: "PATCH", headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" },
      body: JSON.stringify({section, values}),
    }), source.sourceId);
    expect((await update("protection", {honeypotEnabled: true, honeypotFieldNames: [" web site ", "phone"]})).status).toBe(200);
    expect((await findSourceBySourceId(database.db, source.sourceId))?.honeypotFieldNames).toEqual(["website", "phone"]);
    const definition = {fieldDefinitionMode: "json-schema", fieldDefinitionSource: JSON.stringify({type: "object", properties: {website: {type: "string"}}, additionalProperties: false})};
    expect((await update("source-fields", definition)).status).toBe(400);
    expect((await update("protection", {honeypotEnabled: false})).status).toBe(200);
    expect((await update("source-fields", definition)).status).toBe(200);
    expect((await update("protection", {honeypotEnabled: true})).status).toBe(400);
    for (const names of [[], ["altcha"], ["phone", "ph one"], Array.from({length: 11}, (_, i) => `trap_${i}`)]) {
      expect((await update("protection", {honeypotFieldNames: names})).status).toBe(400);
    }
    expect((await findSourceBySourceId(database.db, source.sourceId))?.honeypotFieldNames).toEqual(["website", "phone"]);
  });

  test("requires a session and requires deactivation before deletion", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    const token = await createSession(database.db);
    const handler = createAdminSourceLifecycleHandler({ database: database.db });

    await expect(handler.delete(new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${token}` } }), form.sourceId)).resolves.toMatchObject({ status: 409 });
    const deactivate = await handler.update(new Request("https://forman.example.test", { method: "PATCH", headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" }, body: JSON.stringify({ enabled: false }) }), form.sourceId);
    expect(deactivate.status).toBe(200);
    await expect(handler.delete(new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${token}` } }), form.sourceId)).resolves.toMatchObject({ status: 204 });
  });

  test("updates complete Source configuration for an authenticated administrator", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    const token = await createSession(database.db);
    const response = await createAdminSourceLifecycleHandler({ database: database.db }).configure(
      new Request("https://forman.example.test", {
        method: "PUT", headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: 75, honeypotEnabled: false, maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100,
          maxUniqueKeys: 30, maxValueLength: 10_000, maxValuesPerKey: 20, name: "Updated contact",
          retentionDays: null, storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: 40, successUrl: null,
        }),
      }),
      form.sourceId,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ challengeRateLimitPerMinute: 75, name: "Updated contact", submissionRateLimitPerMinute: 40 });
  });

  test("explains an invalid Source fields row to an authenticated administrator", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    const token = await createSession(database.db);
    const response = await createAdminSourceLifecycleHandler({ database: database.db }).configure(
      new Request("https://forman.example.test", {
        method: "PUT", headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          allowedOrigins: [], altchaEnabled: false, challengeRateLimitPerMinute: null,
          fieldDefinitionMode: "json-schema",
          fieldDefinitionSource: '{"type":"object","properties":{"email":{"type":"email","minLength":3,"maxLength":100}},"required":["email"],"additionalProperties":false}',
          honeypotEnabled: false, maxBodyBytes: 65_536, maxEntries: 50, maxKeyLength: 100,
          maxUniqueKeys: 30, maxValueLength: 10_000, maxValuesPerKey: 20, name: "Contact",
          retentionDays: null, storeReferer: false, storeUserAgent: false, submissionRateLimitPerMinute: null, successUrl: null,
        }),
      }),
      form.sourceId,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Source fields definition is invalid." });
  });

  test("assigns globally configured tags without changing Source configuration", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    const sales = await createTag(database.db, { color: "blue", name: "Sales" });
    const token = await createSession(database.db);

    const response = await createAdminSourceLifecycleHandler({ database: database.db }).update(
      new Request("https://forman.example.test", {
        method: "PATCH",
        headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ section: "tags", values: { tagIds: [sales.id] } }),
      }),
      form.sourceId,
    );

    expect(response.status).toBe(200);
    await expect(listTagsForSource(database.db, form.id)).resolves.toEqual([sales]);
  });

  test("rejects an unknown Source configuration section", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Contact", type: "one-shot" });
    const token = await createSession(database.db);

    const response = await createAdminSourceLifecycleHandler({ database: database.db }).update(
      new Request("https://forman.example.test", {
        method: "PATCH",
        headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ section: "hosted-form", values: { enabled: true, presentation: null } }),
      }),
      form.sourceId,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Source update" });
  });

  test("basic and advanced settings save independently and reject invalid sessions atomically", async () => {
    const database=createTestDatabase();databases.push(database);runMigrations(database.db);
    const source=await createSource(database.db,{name:"Settings", type: "session"});
    const token=await createSession(database.db);
    const handler=createAdminSourceLifecycleHandler({database:database.db});
    const patch=(section:string,values:Record<string,unknown>)=>handler.update(new Request("https://forman.test",{method:"PATCH",headers:{cookie:`__Host-forman_session=${token}`},body:JSON.stringify({section,values})}),source.sourceId);
    expect((await patch("configuration",{name:"Enabled source",successUrl:null})).status).toBe(200);
    expect(sessionSettings(database.db,source.id)).toEqual({enabled:true,inactivityDays:30,completedRetentionDays:30});
    expect((await patch("advanced",{retentionDays:90,sessionInactivityDays:14,sessionCompletedRetentionDays:7})).status).toBe(200);
    expect(sessionSettings(database.db,source.id)).toEqual({enabled:true,inactivityDays:14,completedRetentionDays:7});
    expect(await findSourceBySourceId(database.db,source.sourceId)).toMatchObject({name:"Enabled source",retentionDays:90});
    expect((await patch("configuration",{name:"Disabled source",successUrl:null,sessionEnabled:false})).status).toBe(400);
    expect(sessionSettings(database.db,source.id)).toEqual({enabled:true,inactivityDays:14,completedRetentionDays:7});
    expect((await patch("advanced",{retentionDays:120,sessionInactivityDays:0})).status).toBe(400);
    expect(await findSourceBySourceId(database.db,source.sourceId)).toMatchObject({name:"Enabled source",retentionDays:90});
    expect(sessionSettings(database.db,source.id).inactivityDays).toBe(14);
    database.client.exec("CREATE TRIGGER reject_session_update BEFORE UPDATE OF configuration_json ON source BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await expect(patch("advanced",{retentionDays:120,sessionInactivityDays:21})).rejects.toThrow();
    expect(await findSourceBySourceId(database.db,source.sourceId)).toMatchObject({name:"Enabled source",retentionDays:90});
  });
});
