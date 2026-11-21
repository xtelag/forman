import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { sendPipelineEmail } from "@/server/pipelines/email-action";
import { afterEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "../../../helpers/database";
import { createDatabase } from "@/server/db/client";
import { pipelineActionRuns, pipelineRuns, pipelines, submissions } from "@/server/db/schema";
import { createSource } from "@/server/sources/source-service";
import { runPipelines } from "@/server/pipelines/pipeline-run-worker";
import { acceptPipelineCallback } from "@/server/pipelines/pipeline-callback-handler";
import { confirmEmailConfirmation } from "@/server/pipelines/email-confirmation-session";
import { createStartupBootstrap } from "@/server/startup/bootstrap";
import { loadEnvironment } from "@/server/config/environment";
import { createSession } from "@/server/auth/sessions";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";

describe("durable Pipeline execution", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  async function fixture(overrides: Partial<typeof pipelineActionRuns.$inferInsert> = {}) {
    const database = createTestDatabase();
    databases.push(database);
    const now = new Date();
    const source = await createSource(database.db, { type: "one-shot", name: "Reliability" });
    database.db.insert(pipelines).values({ id: "pipeline", name: "Verify", sourceId: source.id, createdAt: now, updatedAt: now }).run();
    database.db.insert(submissions).values({ id: "submission", sourceId: source.id, payloadJson: '{"email":"person@example.test"}', createdAt: now }).run();
    database.db.insert(pipelineRuns).values({ id: "run", pipelineId: "pipeline", pipelineName: "Verify", sourceId: source.id, submissionId: "submission", snapshotJson: "{}", status: "pending", createdAt: now, updatedAt: now }).run();
    database.db.insert(pipelineActionRuns).values({ id: "action", runId: "run", name: "Deliver", position: 1, type: "webhook", conditionMissBehavior: "skip_action", configurationJson: '{"url":"https://partner.example.test","timeoutSeconds":60}', inputPayloadJson: '{"email":"person@example.test"}', status: "pending", blocking: true, failurePolicy: "cancel", maximumAttempts: 3, nextAttemptAt: now, createdAt: now, updatedAt: now, ...overrides }).run();
    return { database, now, action: () => database.db.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id, "action")).get()! };
  }

  test("claims before slow delivery, including across database connections", async () => {
    const { database, now, action } = await fixture();
    const second = createDatabase(database.client.name);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    let deliveries = 0;
    const sendWebhook = async () => { deliveries++; entered(); await delayed; return { status: 200, body: "{}" }; };
    const first = runPipelines({ database: database.db, now, sendWebhook });
    await started;
    const concurrent = runPipelines({ database: second.db, now, sendWebhook });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const during = action();
    release();
    await Promise.all([first, concurrent]);
    second.close();
    expect(during).toMatchObject({ status: "processing", attemptCount: 1 });
    expect(deliveries).toBe(1);
    expect(action().status).toBe("completed");
  });

  test("bounds callback delivery failures with due times, safe errors and stable idempotency", async () => {
    const { database, now, action } = await fixture({ type: "callback" });
    const keys: unknown[] = [];
    const sendWebhook = async (input: { headers?: Record<string, string> }) => { keys.push(input.headers?.["idempotency-key"]); throw new Error("secret bearer and private response"); };
    await runPipelines({ database: database.db, now, sendWebhook });
    expect(action()).toMatchObject({ attemptCount: 1, status: "retry_scheduled", nextAttemptAt: new Date(now.getTime() + 5_000), callbackToken: null });
    await runPipelines({ database: database.db, now: new Date(now.getTime() + 4_999), sendWebhook });
    expect(action().attemptCount).toBe(1);
    await runPipelines({ database: database.db, now: new Date(now.getTime() + 5_000), sendWebhook });
    expect(action().nextAttemptAt).toEqual(new Date(now.getTime() + 15_000));
    await runPipelines({ database: database.db, now: new Date(now.getTime() + 15_000), sendWebhook });
    expect(action()).toMatchObject({ attemptCount: 3, status: "failed", nextAttemptAt: null });
    expect(action().errorSummary).not.toContain("secret");
    expect(keys).toEqual(["action", "action", "action"]);
    expect(database.db.select().from(pipelineRuns).get()!.status).toBe("cancelled");
  });

  test("caps exponential delay at five minutes", async () => {
    const { database, now, action } = await fixture({ attemptCount: 7, maximumAttempts: 10 });
    await runPipelines({ database: database.db, now, sendWebhook: async () => { throw new Error("offline"); } });
    expect(action()).toMatchObject({ attemptCount: 8, nextAttemptAt: new Date(now.getTime() + 300_000) });
  });

  test.each([
    { body: '"private response"', status: 200, error: "Webhook response must be a flat JSON object." },
    { body: '{"private":{"secret":true}}', status: 200, error: "Webhook response must be a flat JSON object." },
    { body: 'private invalid JSON', status: 200, error: "Webhook response is not valid JSON." },
    { body: 'private HTTP failure', status: 503, error: "Webhook returned a non-success HTTP status." },
    { body: 'private transport failure', status: 0, error: "Webhook connection failed. Check the destination and network." },
  ])("reports a safe Webhook diagnostic for $status / $body without changing retries", async ({ body, status, error }) => {
    const { database, now, action } = await fixture();
    const sendWebhook = async () => {
      if (!status) throw new Error(body);
      return { body, status };
    };
    await runPipelines({ database: database.db, now, sendWebhook });
    expect(action()).toMatchObject({ attemptCount: 1, status: "retry_scheduled", nextAttemptAt: new Date(now.getTime() + 5_000), errorSummary: error, outputPayloadJson: null });
    await runPipelines({ database: database.db, now: new Date(now.getTime() + 5_000), sendWebhook });
    await runPipelines({ database: database.db, now: new Date(now.getTime() + 15_000), sendWebhook });
    expect(action()).toMatchObject({ attemptCount: 3, status: "failed", nextAttemptAt: null, errorSummary: error });
    const session = await createSession(database.db);
    const response = await createAdminPipelineRunsHandler({ database: database.db }).getById("run", new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${session}` } }));
    const detail = await response.json();
    expect(detail.actions[0].errorSummary).toBe(error);
    expect(JSON.stringify(detail)).not.toContain("private");
  });

  test.each([
    { body: "", expected: { email: "person@example.test" } },
    { body: "   ", expected: { email: "person@example.test" } },
    { body: "{}", expected: { email: "person@example.test" } },
    { body: '{"verified":true,"topics":["forms","surveys"]}', expected: { email: "person@example.test", verified: true, topics: ["forms", "surveys"] } },
  ])("accepts an empty or flat Webhook response: $body", async ({ body, expected }) => {
    const { database, now, action } = await fixture();
    await runPipelines({ database: database.db, now, sendWebhook: async () => ({ body, status: 200 }) });
    expect(action()).toMatchObject({ status: "completed", errorSummary: null });
    expect(JSON.parse(action().outputPayloadJson!)).toEqual(expected);
  });

  test("redacts unrecognized stored Webhook errors, including appended private details", async () => {
    const { database } = await fixture({ status: "failed", errorSummary: "Webhook response is not valid JSON. private response body" });
    const session = await createSession(database.db);
    const response = await createAdminPipelineRunsHandler({ database: database.db }).getById("run", new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${session}` } }));
    const detail = await response.json();
    expect(detail.actions[0].errorSummary).toBe("Webhook request failed.");
    expect(JSON.stringify(detail)).not.toContain("private");
  });

  test("accepts an immediate callback and does not overwrite its result when delivery fails", async () => {
    const { database, now, action } = await fixture({ type: "callback_boolean", configurationJson: '{"url":"https://partner.example.test","timeoutSeconds":60,"field":"verified"}' });
    let callbackStatus = 0;
    await runPipelines({ database: database.db, now, sendWebhook: async (input) => {
      const url = JSON.parse(input.body).meta.callbackUrl as string;
      callbackStatus = (await acceptPipelineCallback(database.db, url.split("/").at(-1)!, new Request(url))).status;
      throw new Error("response lost");
    } });
    expect(callbackStatus).toBe(204);
    expect(action()).toMatchObject({ status: "completed", attemptCount: 1, outputPayloadJson: '{"email":"person@example.test","verified":true}' });
  });

  test("accepts confirmation during mail delivery without reopening the completed Action", async () => {
    const { database, now, action } = await fixture({ type: "email_confirmation", configurationJson: '{"emailField":"email","booleanField":"verified","timeoutHours":24}' });
    await runPipelines({ database: database.db, now, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail: async (email) => {
      expect(confirmEmailConfirmation(database.db, email.url.split("/").at(-1)!, now)).not.toBeNull();
    } });
    expect(action()).toMatchObject({ status: "completed", attemptCount: 1, outputPayloadJson: '{"email":"person@example.test","verified":true}' });
  });

  test.each(['{"nested":{"private":"data"}}', '{"bad":null}', '{"bad":[]}', '{"bad":[[1]]}'])("rejects invalid Webhook output %s while preserving input", async (body) => {
    const { database, now, action } = await fixture({ maximumAttempts: 1, failurePolicy: "bypass" });
    await runPipelines({ database: database.db, now, sendWebhook: async () => ({ body, status: 200 }) });
    expect(action()).toMatchObject({ status: "bypassed", outputPayloadJson: '{"email":"person@example.test"}' });
  });

  test.each(['{"nested":{"bad":true}}', '$error("private payload")'])("isolates malformed Transformation %s from another run", async (expression) => {
    const { database, now, action } = await fixture({ type: "transformation", configurationJson: JSON.stringify({ expression }), maximumAttempts: 1 });
    const original = database.db.select().from(pipelineRuns).get()!;
    database.db.insert(pipelineRuns).values({ ...original, id: "other-run", pipelineId: null }).run();
    database.db.insert(pipelineActionRuns).values({ ...action(), id: "other-action", runId: "other-run", type: "transformation", configurationJson: '{"expression":"{\\"ok\\":true}"}' }).run();
    await expect(runPipelines({ database: database.db, now })).resolves.toBe(2);
    expect(action()).toMatchObject({ status: "failed", outputPayloadJson: null });
    expect(action().errorSummary).not.toContain("private");
    expect(database.db.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id, "other-action")).get()).toMatchObject({ status: "completed" });
  });

  test("does not repeat completed downstream Actions when an earlier non-blocking Action is retried", async () => {
    const { database, now, action } = await fixture({ blocking: false });
    database.db.insert(pipelineActionRuns).values({ ...action(), id: "downstream", position: 2, status: "completed", attemptCount: 1, outputPayloadJson: '{"original":true}' }).run();
    let deliveries = 0;
    await runPipelines({ database: database.db, now, sendWebhook: async () => { deliveries++; return { body: '{"new":true}', status: 200 }; } });
    await runPipelines({ database: database.db, now, sendWebhook: async () => { deliveries++; return { body: "{}", status: 200 }; } });
    expect(deliveries).toBe(1);
    expect(database.db.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id, "downstream")).get()).toMatchObject({ attemptCount: 1, outputPayloadJson: '{"original":true}' });
  });

  test.each([1, 3])("startup recovers an interrupted Action at attempt %i without resetting its budget", async (attemptCount) => {
    const { database, action } = await fixture({ status: "processing", attemptCount });
    const reopened = createDatabase(database.client.name);
    const environment = loadEnvironment({ NODE_ENV: "test", FORMAN_BASE_ORIGIN: "https://forman.example.test", FORMAN_DATABASE_PATH: database.client.name, FORMAN_SESSION_SECRET: "a".repeat(32), FORMAN_ALTCHA_SECRET: "b".repeat(32), FORMAN_INITIAL_ADMIN_PASSWORD: "a secure password" });
    await createStartupBootstrap({ database: reopened.db, environment, write: () => {} }).start();
    reopened.close();
    expect(action()).toMatchObject({ attemptCount, status: attemptCount === 3 ? "failed" : "retry_scheduled" });
    if (attemptCount === 1) expect(action().nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  test("recovers a persisted processing claim after its writer is killed", async () => {
    const { database } = await fixture();
    const databasePath = database.client.name;
    database.close();
    const sqliteModule = createRequire(import.meta.url).resolve("better-sqlite3");
    const child = spawn(process.execPath, ["-e", `
      const Database = require(process.argv[1]);
      const db = new Database(process.argv[2]);
      db.pragma("journal_mode = WAL");
      db.prepare("update pipeline_action_run set status = 'processing', attempt_count = 1 where id = 'action'").run();
      process.stdout.write("claimed");
      setInterval(() => {}, 1000);
    `, sqliteModule, databasePath], { stdio: ["ignore", "pipe", "pipe"] });
    const exited = once(child, "exit");
    try {
      const ready = await Promise.race([
        once(child.stdout!, "data", { signal: AbortSignal.timeout(3_000) }),
        exited.then(() => { throw new Error("Claim writer exited before persisting its claim"); }),
      ]);
      expect(String(ready[0])).toBe("claimed");
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
    const reopened = createDatabase(databasePath);
    try {
      const environment = loadEnvironment({ NODE_ENV: "test", FORMAN_BASE_ORIGIN: "https://forman.example.test",
        FORMAN_DATABASE_PATH: databasePath, FORMAN_SESSION_SECRET: "a".repeat(32),
        FORMAN_ALTCHA_SECRET: "b".repeat(32), FORMAN_INITIAL_ADMIN_PASSWORD: "a secure password" });
      await createStartupBootstrap({ database: reopened.db, environment, write: () => {} }).start();
      const action = () => reopened.db.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id, "action")).get()!;
      expect(action()).toMatchObject({ status: "retry_scheduled", attemptCount: 1 });
      const retryAt = action().nextAttemptAt!;
      let deliveries = 0;
      const worker = { database: reopened.db, now: retryAt, sendWebhook: async () => {
        deliveries++; return { status: 200, body: "{}" };
      } };
      await runPipelines(worker);
      await runPipelines(worker);
      expect(action()).toMatchObject({ status: "completed", attemptCount: 2 });
      expect(deliveries).toBe(1);
    } finally {
      reopened.close();
    }
  });

  test("requires an explicit administrator retry before reissuing an expired confirmation", async () => {
    const { database, now, action } = await fixture({ type: "email_confirmation", configurationJson: '{"emailField":"email","booleanField":"verified","timeoutHours":1}' });
    const urls: string[] = [];
    const sendConfirmationEmail = async (email: { url: string }) => { urls.push(email.url); };
    await runPipelines({ database: database.db, now, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail });
    const expiredAt = new Date(now.getTime() + 3_600_000);
    await runPipelines({ database: database.db, now: expiredAt, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail });
    expect(action()).toMatchObject({ status: "failed", attemptCount: 1, nextAttemptAt: null });
    expect(database.db.select().from(pipelineRuns).get()!.status).toBe("cancelled");
    const retryAt = new Date(expiredAt.getTime() + 5_000);
    await runPipelines({ database: database.db, now: retryAt, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail });
    expect(urls).toHaveLength(1);
    const session = await createSession(database.db);
    const response = await createAdminPipelineRunsHandler({ database: database.db }).retry("action", new Request("https://forman.example.test", { headers: { cookie: `__Host-forman_session=${session}` }, method: "POST" }));
    expect(response.status).toBe(202);
    await runPipelines({ database: database.db, now: retryAt, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail });
    expect(action()).toMatchObject({ status: "waiting_callback", attemptCount: 1 });
    expect(urls).toHaveLength(2);
    expect(urls[1]).not.toBe(urls[0]);
    expect(confirmEmailConfirmation(database.db, urls[0]!.split("/").at(-1)!, retryAt)).toBeNull();
    expect(confirmEmailConfirmation(database.db, urls[1]!.split("/").at(-1)!, retryAt)).not.toBeNull();
    expect(action().status).toBe("completed");
  });

  test("bypasses expired human confirmation without sending another email", async () => {
    const { database, now, action } = await fixture({ type: "email_confirmation", failurePolicy: "bypass", configurationJson: '{"emailField":"email","booleanField":"verified","timeoutHours":1}' });
    let emails = 0;
    const sendConfirmationEmail = async () => { emails++; };
    await runPipelines({ database: database.db, now, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail });
    await runPipelines({ database: database.db, now: new Date(now.getTime() + 3_600_000), confirmationSecret: "a sufficiently long secret", sendConfirmationEmail });
    await runPipelines({ database: database.db, now: new Date(now.getTime() + 7_200_000), confirmationSecret: "a sufficiently long secret", sendConfirmationEmail });
    expect(emails).toBe(1);
    expect(action()).toMatchObject({ status: "bypassed", attemptCount: 1, nextAttemptAt: null, outputPayloadJson: '{"email":"person@example.test"}' });
    expect(database.db.select().from(pipelineRuns).get()!.status).toBe("completed");
  });

  test("settles every attached Action when a shared confirmation delivery fails", async () => {
    const { database, now, action } = await fixture({ type: "email_confirmation", configurationJson: '{"emailField":"email","booleanField":"verified","timeoutHours":1}' });
    const second = createDatabase(database.client.name);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const first = runPipelines({ database: database.db, now, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail: async () => { entered(); await delayed; throw new Error("offline"); } });
    await started;
    database.db.insert(submissions).values({ id: "other-submission", sourceId: database.db.select().from(pipelineRuns).get()!.sourceId, payloadJson: action().inputPayloadJson, createdAt: now }).run();
    database.db.insert(pipelineRuns).values({ ...database.db.select().from(pipelineRuns).get()!, id: "other-run", submissionId: "other-submission" }).run();
    database.db.insert(pipelineActionRuns).values({ ...action(), id: "other-action", runId: "other-run", status: "pending", attemptCount: 0 }).run();
    await runPipelines({ database: second.db, now, confirmationSecret: "a sufficiently long secret", sendConfirmationEmail: async () => { throw new Error("must attach"); } });
    release();
    await first;
    second.close();
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([
      { attemptCount: 1, status: "retry_scheduled" }, { attemptCount: 1, status: "retry_scheduled" },
    ]);
  });
  test("continues independent runs while one destination is stalled, preserving each run's order", async()=>{
    const {database,now,action}=await fixture();
    const original=database.db.select().from(pipelineRuns).get()!;
    database.db.insert(pipelineRuns).values({...original,id:"other-run",pipelineId:null}).run();
    database.db.insert(pipelineActionRuns).values({...action(),id:"other-action",runId:"other-run"}).run();
    database.db.insert(pipelineActionRuns).values({...action(),id:"downstream",position:2,status:"not_run"}).run();
    let release!:()=>void;
    const stalled=new Promise<void>(resolve=>{release=resolve});
    const delivered:string[]=[];
    const cycle=runPipelines({database:database.db,now,sendWebhook:async request=>{
      const id=request.headers["idempotency-key"];delivered.push(id);
      if(id==="action") await stalled;
      return {status:200,body:"{}"};
    }});
    try {
      await new Promise(resolve=>setTimeout(resolve,30));
      expect(delivered).toContain("other-action");
      expect(delivered).not.toContain("downstream");
      expect(database.db.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id,"other-action")).get()?.status).toBe("completed");
    } finally {release();await cycle;}
    expect(delivered).toEqual(["action","other-action","downstream"]);
  });

  test("bounds concurrent independent deliveries and drains all work before resolving", async()=>{
    const {database,now,action}=await fixture();
    const original=database.db.select().from(pipelineRuns).get()!;
    for(let i=1;i<8;i++){
      database.db.insert(pipelineRuns).values({...original,id:"run-"+i,pipelineId:null}).run();
      database.db.insert(pipelineActionRuns).values({...action(),id:"action-"+i,runId:"run-"+i}).run();
    }
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve});
    let active=0;let peak=0;let completed=0;
    const cycle=runPipelines({database:database.db,now,sendWebhook:async()=>{
      active++;peak=Math.max(peak,active);await gate;active--;completed++;
      return {status:200,body:"{}"};
    }});
    try {
      await new Promise(resolve=>setTimeout(resolve,30));
      expect(active).toBeGreaterThan(1);expect(active).toBeLessThan(8);
    } finally {release();await cycle;}
    expect(peak).toBeLessThan(8);expect(active).toBe(0);expect(completed).toBe(8);
  });

  test("delivers the configured Email subject, format and Source field labels", async () => {
    const { database, now, action } = await fixture({ type: "email", configurationJson: JSON.stringify({ recipients: ["to@example.test"], subject: "Contact enquiry", contentFormat: "formatted" }) });
    const sourceId = database.db.select().from(pipelineRuns).get()!.sourceId;
    mutateSourceConfiguration(database.db, sourceId, () => ({ fieldDefinitionMode: "json-schema", fieldDefinitionSource: JSON.stringify({ type: "object", additionalProperties: false, properties: { email: { type: "string", title: "Email address" } } }) }));
    let delivered = false;
    await runPipelines({ database: database.db, now, sendEmail: async ({ payload, ...settings }) => {
      await sendPipelineEmail({ ...settings, from: "from@example.test", payloadJson: JSON.stringify(payload), sendMail: async message => {
        expect(message.subject).toBe("Contact enquiry");
        expect(message.text).toBe("Email address: person@example.test");
        expect(message.html).toContain("<table");
        delivered = true;
      } });
    } });
    expect(delivered).toBe(true);
    expect(action().status).toBe("completed");
  });

});
