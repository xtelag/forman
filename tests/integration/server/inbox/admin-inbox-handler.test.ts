import { afterEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createSession } from "@/server/auth/sessions";
import {
  pipelineRuns,
  pipelineActionRuns,
  configuredInboxItems,
  submissions,
} from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createSource } from "@/server/sources/source-service";
import { createAdminInboxHandler } from "@/server/inbox/admin-inbox-handler";
import { createTag, replaceSourceTags } from "@/server/tags/tag-service";
import { createTestDatabase } from "../../../helpers/database";

describe("admin Inbox handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  function createInboxItem(
    database: ReturnType<typeof createTestDatabase>,
    input: { id: string; sourceId: string; subject: string },
  ) {
    const now = new Date("2026-08-20T12:00:00.000Z");
    database.db.insert(submissions).values({
      createdAt: now,
      id: `submission-${input.id}`,
      payloadJson: "{}",
      sourceId: input.sourceId,
    }).run();
    database.db.insert(pipelineRuns).values({
      createdAt: now,
      pipelineId: null,
      pipelineName: "Archive",
      id: `run-${input.id}`,
      snapshotJson: "{}",
      sourceId: input.sourceId,
      status: "completed",
      submissionId: `submission-${input.id}`,
      updatedAt: now,
    }).run();
    database.db.insert(pipelineActionRuns).values({
      actionId: null,
      attemptCount: 1,
      blocking: false,
      conditionMissBehavior: "skip_action",
      configurationJson: "{}",
      createdAt: now,
      failurePolicy: null,
      id: `action-${input.id}`,
      inputPayloadJson: "{}",
      maximumAttempts: 3,
      name: "Archive",
      position: 1,
      runId: `run-${input.id}`,
      status: "completed",
      type: "inbox",
      updatedAt: now,
    }).run();
    database.db.insert(configuredInboxItems).values({
      actionName: "Archive",
      createdAt: now,
      pipelineActionRunId: `action-${input.id}`,
      id: input.id,
      payloadJson: JSON.stringify({ subject: input.subject }),
      sourceId: input.sourceId,
      sourceName: "Source",
      state: "unread",
      submissionId: `submission-${input.id}`,
      updatedAt: now,
    }).run();
  }

  test("reports Trash existence independently of list filters", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, {type: "one-shot", name: "Trash check"});
    createInboxItem(database, {id: "trash-check", sourceId: source.id, subject: "Sample"});
    const token = await createSession(database.db);
    const handler = createAdminInboxHandler({database: database.db});
    const list = () => handler.list(new Request("https://forman.example.test/api/admin/v1/inbox?view=trash&search=missing", {
      headers: {cookie: "__Host-forman_session=" + token},
    })).then(response => response.json());
    expect(await list()).toMatchObject({total: 0, hasTrash: false});
    database.db.update(configuredInboxItems).set({trashedAt: new Date()}).where(eq(configuredInboxItems.id, "trash-check")).run();
    expect(await list()).toMatchObject({items: [], total: 0, hasTrash: true});
  });

  test("captures all matching IDs across pages and limits mutation batches", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, {type: "one-shot", name: "Bulk selection"});
    const other = await createSource(database.db, {type: "one-shot", name: "Other"});
    for (let n = 0; n < 250; n++) createInboxItem(database, {id: "bulk-" + n, sourceId: source.id, subject: "Sample"});
    createInboxItem(database, {id: "other", sourceId: other.id, subject: "Sample"});
    const token = await createSession(database.db);
    const headers = {cookie: "__Host-forman_session=" + token, "content-type": "application/json"};
    const handler = createAdminInboxHandler({database: database.db});
    const url = "https://forman.example.test/api/admin/v1/inbox?selection=all&sourceId=" + source.id + "&size=10&page=2";
    expect((await handler.list(new Request(url))).status).toBe(401);
    const selection = await (await handler.list(new Request(url, {headers}))).json() as {ids: string[]};
    expect(selection.ids).toHaveLength(250);
    expect(selection.ids).not.toContain("other");
    createInboxItem(database, {id: "later", sourceId: source.id, subject: "Sample"});
    expect(selection.ids).not.toContain("later");
    const bulk = (ids: string[]) => handler.bulk(new Request("https://forman.example.test/api/admin/v1/inbox", {method: "POST", headers, body: JSON.stringify({action: "read", ids})}));
    expect((await bulk(selection.ids)).status).toBe(400);
    for (let offset = 0; offset < selection.ids.length; offset += 100) expect((await bulk(selection.ids.slice(offset, offset + 100))).status).toBe(200);
    expect(database.db.select().from(configuredInboxItems).where(eq(configuredInboxItems.id, "later")).get()?.state).toBe("unread");
  });

  test("permanent deletion is restricted to selected Trash items and preserves linked data", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, {type:"one-shot", name:"Deletion test"});
    for (const id of ["trashed", "active", "other", "single"]) createInboxItem(database, {id,sourceId:source.id,subject:id});
    for (const id of ["trashed", "other", "single"]) database.db.update(configuredInboxItems).set({trashedAt:new Date()}).where(eq(configuredInboxItems.id,id)).run();
    const token = await createSession(database.db);
    const handler = createAdminInboxHandler({database:database.db});
    const request = (action:string,ids:string[]=[],authorized=true) => new Request("https://forman.example.test/api/admin/v1/inbox",{method:"POST",headers:authorized?{cookie:"__Host-forman_session="+token}:{},body:JSON.stringify({action,ids})});
    expect((await handler.bulk(request("delete",["trashed"],false))).status).toBe(401);
    expect((await handler.update(request("delete"),"active")).status).toBe(409);
    expect((await handler.update(request("delete"),"single")).status).toBe(204);
    expect((await handler.update(request("delete"),"single")).status).toBe(404);
    expect(await (await handler.bulk(request("delete",["trashed","active","missing"]))).json()).toEqual({changed:1});
    expect(database.db.select().from(configuredInboxItems).all().map(v=>v.id).sort()).toEqual(["active","other"]);
    expect(database.db.select().from(submissions).all()).toHaveLength(4);
    expect(database.db.select().from(pipelineRuns).all()).toHaveLength(4);
    expect(database.db.select().from(pipelineActionRuns).all()).toHaveLength(4);
    expect(await (await handler.bulk(request("delete",[]))).json()).toEqual({changed:0});
  });

  test("matches an Inbox item with any selected tag", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const [sales, support] = await Promise.all([
      createTag(database.db, { color: "blue", name: "Sales" }),
      createTag(database.db, { color: "violet", name: "Support" }),
    ]);
    const [salesForm, supportForm, otherForm] = await Promise.all([
      createSource(database.db, { type: "one-shot", name: "Sales form" }),
      createSource(database.db, { type: "one-shot", name: "Support form" }),
      createSource(database.db, { type: "one-shot", name: "Other form" }),
    ]);
    await replaceSourceTags(database.db, salesForm.id, [sales.id]);
    await replaceSourceTags(database.db, supportForm.id, [support.id]);
    await Promise.all([
      createInboxItem(database, { id: "sales-item", sourceId: salesForm.id, subject: "Sales" }),
      createInboxItem(database, { id: "support-item", sourceId: supportForm.id, subject: "Support" }),
      createInboxItem(database, { id: "other-item", sourceId: otherForm.id, subject: "Other" }),
    ]);
    const token = await createSession(database.db);

    const response = await createAdminInboxHandler({ database: database.db }).list(
      new Request(`https://forman.example.test/api/admin/v1/inbox?tagId=${sales.id}&tagId=${support.id}`, {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { items: { id: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.items.map((item) => item.id).sort()).toEqual(["sales-item", "support-item"]);
  });

  test("filters Inbox items by full-text search within an inclusive date range", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact form" });
    await Promise.all([
      createInboxItem(database, { id: "before", sourceId: form.id, subject: "Ada before" }),
      createInboxItem(database, { id: "match", sourceId: form.id, subject: "Ada Lovelace" }),
      createInboxItem(database, { id: "after", sourceId: form.id, subject: "Ada after" }),
    ]);
    await Promise.all([
      database.db.update(configuredInboxItems).set({ createdAt: new Date("2026-08-19T23:59:59.000Z") }).where(eq(configuredInboxItems.id, "before")),
      database.db.update(configuredInboxItems).set({ createdAt: new Date("2026-08-20T12:00:00.000Z") }).where(eq(configuredInboxItems.id, "match")),
      database.db.update(configuredInboxItems).set({ createdAt: new Date("2026-08-21T00:00:00.000Z") }).where(eq(configuredInboxItems.id, "after")),
    ]);
    const token = await createSession(database.db);

    const response = await createAdminInboxHandler({ database: database.db }).list(
      new Request("https://forman.example.test/api/admin/v1/inbox?search=Ada&from=2026-08-20&to=2026-08-20", {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: "match" }],
      total: 1,
    });
  });

  test("exports every item in the filtered view without pagination", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const [sales, support] = await Promise.all([
      createTag(database.db, { color: "blue", name: "Sales" }),
      createTag(database.db, { color: "violet", name: "Support" }),
    ]);
    const [salesSource, supportSource, otherSource] = await Promise.all([
      createSource(database.db, { type: "one-shot", name: "Sales source" }),
      createSource(database.db, { type: "one-shot", name: "Support source" }),
      createSource(database.db, { type: "one-shot", name: "Other source" }),
    ]);
    await replaceSourceTags(database.db, salesSource.id, [sales.id]);
    await replaceSourceTags(database.db, supportSource.id, [support.id]);
    await Promise.all([
      createInboxItem(database, { id: "sales-export", sourceId: salesSource.id, subject: "Sales" }),
      createInboxItem(database, { id: "support-export", sourceId: supportSource.id, subject: "Support" }),
      createInboxItem(database, { id: "other-export", sourceId: otherSource.id, subject: "Other" }),
    ]);
    const token = await createSession(database.db);

    const response = await createAdminInboxHandler({ database: database.db }).export(
      new Request(`https://forman.example.test/api/admin/v1/inbox/export?tagId=${sales.id}&tagId=${support.id}&page=1&limit=1`, {
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="forman-inbox.csv"');
    const csv = await response.text();
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain("sales-export");
    expect(csv).toContain("support-export");
    expect(csv).not.toContain("other-export");
  });

  test("rejects an unauthenticated Inbox export", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    const response = await createAdminInboxHandler({ database: database.db }).export(
      new Request("https://forman.example.test/api/admin/v1/inbox/export"),
    );

    expect(response.status).toBe(401);
  });
  test("materializes only the requested page using a bounded number of queries", async () => {
    const database=createTestDatabase(); databases.push(database);
    const source=await createSource(database.db,{type:"one-shot",name:"Large Inbox"});
    for(let i=0;i<120;i++) createInboxItem(database,{id:"page-"+String(i).padStart(3,"0"),sourceId:source.id,subject:"ŽLUŤOUČKÝ 100%_"});
    const token=await createSession(database.db);
    const prepare=database.client.prepare.bind(database.client);
    let rowsRead=0; let queries=0;
    const spy=vi.spyOn(database.client,"prepare").mockImplementation((...args)=>{
      const statement=prepare(...args);
      const proxy: typeof statement = new Proxy(statement,{get(target,key){
        const value=Reflect.get(target,key);
        if(key==="all") return (...params: unknown[])=>{queries++;const rows=target.all(...params);rowsRead+=rows.length;return rows;};
        return typeof value==="function"?(...params:unknown[])=>{const result=value.apply(target,params);return result===target?proxy:result;}:value;
      }});
      return proxy;
    });
    try {
      const response=await createAdminInboxHandler({database:database.db}).list(new Request("https://forman.example.test/api/admin/v1/inbox?page=2&limit=10",{headers:{cookie:"__Host-forman_session="+token}}));
      const body=await response.json();
      expect(body.total).toBe(120);expect(body.items).toHaveLength(10);
      expect(rowsRead).toBeLessThanOrEqual(12);expect(queries).toBeLessThanOrEqual(4);
      expect(new Set(body.items.map((item:{id:string})=>item.id)).size).toBe(10);
    } finally {spy.mockRestore();}
  });

  test("keeps Unicode, literal wildcard and rendered preview search semantics", async()=>{
    const database=createTestDatabase();databases.push(database);
    const source=await createSource(database.db,{type:"one-shot",name:"Search"});
    createInboxItem(database,{id:"literal",sourceId:source.id,subject:"Žluťoučký 100%_"});
    createInboxItem(database,{id:"other",sourceId:source.id,subject:"100 percent"});
    database.db.update(configuredInboxItems).set({payloadJson:JSON.stringify({payload:{first:"Žluťoučký",second:"100%_",third:true}})}).where(eq(configuredInboxItems.id,"literal")).run();
    const token=await createSession(database.db);
    for(const search of ["žLUŤOUČKÝ","100%_","Žluťoučký · 100%_ · true"]){
      const response=await createAdminInboxHandler({database:database.db}).list(new Request("https://forman.example.test/api/admin/v1/inbox?search="+encodeURIComponent(search),{headers:{cookie:"__Host-forman_session="+token}}));
      expect(await response.json()).toMatchObject({total:1,items:[{id:"literal"}]});
    }
  });


  test("moves an archived item back to the Inbox as read", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact form" });
    await createInboxItem(database, { id: "single", sourceId: form.id, subject: "Single" });
    await createInboxItem(database, { id: "bulk", sourceId: form.id, subject: "Bulk" });
    await database.db.update(configuredInboxItems).set({ archivedAt: new Date(), state: "archived" });
    const token = await createSession(database.db);
    const handler = createAdminInboxHandler({ database: database.db });
    const headers = { "content-type": "application/json", cookie: `__Host-forman_session=${token}` };

    const single = await handler.update(new Request("https://forman.example.test/api/admin/v1/inbox/single", {
      body: JSON.stringify({ action: "unarchive" }), headers, method: "PATCH",
    }), "single");
    expect(single.status).toBe(204);
    const bulk = await handler.bulk(new Request("https://forman.example.test/api/admin/v1/inbox", {
      body: JSON.stringify({ action: "unarchive", ids: ["bulk"] }), headers, method: "POST",
    }));
    await expect(bulk.json()).resolves.toEqual({ changed: 1 });

    expect(database.db.select({ archivedAt: configuredInboxItems.archivedAt, id: configuredInboxItems.id, state: configuredInboxItems.state })
      .from(configuredInboxItems).all()).toEqual(expect.arrayContaining([
      { archivedAt: null, id: "single", state: "read" },
      { archivedAt: null, id: "bulk", state: "read" },
    ]));
  });
});
