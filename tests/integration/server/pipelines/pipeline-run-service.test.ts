import { afterEach, describe, expect, test, vi } from "vitest";

import {
  pipelineRuns,
  pipelineActionRuns,
  pipelines,
  pipelineActions,
  emailConfirmationSessions,
  submissions,
} from "@/server/db/schema";
import {
  insertPreparedPipelineRuns,
  preparePipelineRuns,
} from "@/server/pipelines/pipeline-run-service";
import { runPipelines } from "@/server/pipelines/pipeline-run-worker";
import { acceptPipelineCallback } from "@/server/pipelines/pipeline-callback-handler";
import { confirmEmailConfirmation, getPublicEmailConfirmation } from "@/server/pipelines/email-confirmation-session";
import { getGlobalSettings, updateGlobalSettings } from "@/server/config/global-settings";
import { runMigrations } from "@/server/db/migrate";
import { createSource } from "@/server/sources/source-service";
import { createTestDatabase } from "../../../helpers/database";

describe("configured Pipeline run service", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("snapshots every enabled Pipeline and creates ordered Action runs", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const createdAt = new Date("2026-08-30T10:00:00.000Z");
    database.db.insert(pipelines).values({
      createdAt,
      enabled: true,
      id: "flow-1",
      name: "Contact processing",
      sourceId: source.id,
      updatedAt: createdAt,
    }).run();
    database.db.insert(pipelineActions).values([
      {
        blocking: true,
        conditionMissBehavior: "skip_action",
        configurationJson: "{}",
        createdAt,
        pipelineId: "flow-1",
        enabled: true,
        id: "action-1",
        maximumAttempts: 3,
        name: "Normalize",
        position: 1,
        type: "transformation",
        updatedAt: createdAt,
      },
      {
        blocking: false,
        conditionMissBehavior: "skip_action",
        configurationJson: "{}",
        createdAt,
        pipelineId: "flow-1",
        enabled: true,
        id: "action-2",
        maximumAttempts: 3,
        name: "Archive",
        position: 2,
        type: "inbox",
        updatedAt: createdAt,
      },
    ]).run();

    const prepared = await preparePipelineRuns(database.db, {
      createdAt,
      payload: { email: "person@example.test" },
      sourceId: source.id,
    });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({
        createdAt,
        id: "submission-1",
        payloadJson: '{"email":"person@example.test"}',
        sourceId: source.id,
      }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([
      {
        pipelineId: "flow-1",
        pipelineName: "Contact processing",
        sourceId: source.id,
        status: "pending",
        submissionId: "submission-1",
      },
    ]);
    expect(database.db.select().from(pipelineActionRuns).orderBy(pipelineActionRuns.position).all()).toMatchObject([
      { actionId: "action-1", name: "Normalize", position: 1, status: "pending" },
      { actionId: "action-2", name: "Archive", position: 2, status: "not_run" },
    ]);
  });

  test("does not prepare a Run for an enabled Pipeline without Actions", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const createdAt = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(pipelines).values({
      createdAt,
      enabled: true,
      id: "empty-pipeline",
      name: "Empty processing",
      sourceId: source.id,
      updatedAt: createdAt,
    }).run();

    await expect(preparePipelineRuns(database.db, {
      createdAt,
      payload: { email: "person@example.test" },
      sourceId: source.id,
    })).resolves.toEqual([]);
  });

  test("executes a Transformation, skips a non-matching Action, and completes the run", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-01T12:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Process", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values([
      { blocking: true, conditionMissBehavior: "skip_action", configurationJson: JSON.stringify({ expression: '{"normalized": $uppercase(email)}' }), createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 3, name: "Normalize", position: 1, type: "transformation", updatedAt: now },
      { blocking: false, conditionJson: '{"mode":"all","conditions":[{"field":"kind","operator":"equals","value":"lead"}]}', conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-2", maximumAttempts: 3, name: "Archive", position: 2, type: "inbox", updatedAt: now },
    ]).run();
    const prepared = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    await runPipelines({ database: database.db, now });

    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed" }]);
    expect(database.db.select().from(pipelineActionRuns).orderBy(pipelineActionRuns.position).all()).toMatchObject([
      { status: "completed", outputPayloadJson: '{"email":"person@example.test","normalized":"PERSON@EXAMPLE.TEST"}' },
      { status: "skipped_condition" },
    ]);
  });

  test("sends a Webhook Action and merges its JSON response into the payload", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-01T12:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Process", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({ blocking: true, conditionMissBehavior: "skip_action", configurationJson: '{"url":"https://example.test/webhook","bearerToken":"secret"}', createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 3, name: "Enrich", position: 1, type: "webhook", updatedAt: now }).run();
    const prepared = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    await runPipelines({ database: database.db, now, sendWebhook: async (input) => {
      expect(input).toMatchObject({ body: '{"email":"person@example.test"}', headers: { authorization: "Bearer secret", "content-type": "application/json" }, url: "https://example.test/webhook" });
      return { body: '{"verified":true}', status: 200 };
    } });

    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ attemptCount: 1, outputPayloadJson: '{"email":"person@example.test","verified":true}', status: "completed" }]);
  });

  test("keeps a failed Webhook Action in retry state until a later attempt succeeds", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-01T12:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Process", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({ blocking: true, conditionMissBehavior: "skip_action", configurationJson: '{"url":"https://example.test/webhook"}', createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 2, name: "Enrich", position: 1, type: "webhook", updatedAt: now }).run();
    const prepared = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    await runPipelines({ database: database.db, now, sendWebhook: async () => { throw new Error("offline"); } });
    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "processing" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ attemptCount: 1, status: "retry_scheduled" }]);

    await runPipelines({ database: database.db, now: new Date(now.getTime() + 5_000), sendWebhook: async () => ({ body: "{}", status: 200 }) });
    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ attemptCount: 2, status: "completed" }]);
  });

  test("completes with attention when a non-blocking Webhook fails permanently", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-02T10:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Process", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({ blocking: false, conditionMissBehavior: "skip_action", configurationJson: '{"url":"https://example.test/webhook"}', createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 1, name: "Notify CRM", position: 1, type: "webhook", updatedAt: now }).run();
    const prepared = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    await runPipelines({ database: database.db, now, sendWebhook: async () => { throw new Error("offline"); } });

    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed_attention" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ attemptCount: 1, status: "failed" }]);
  });

  test("sends an Email Action through the configured sender", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-01T12:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Process", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({ blocking: false, conditionMissBehavior: "skip_action", configurationJson: '{"recipients":["sales@example.test"]}', createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 3, name: "Notify sales", position: 1, type: "email", updatedAt: now }).run();
    const prepared = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    const sendEmail = vi.fn().mockResolvedValue(undefined);
    await runPipelines({ database: database.db, now, sendEmail });

    expect(sendEmail).toHaveBeenCalledWith({ payload: { email: "person@example.test" }, recipients: ["sales@example.test"], subject: undefined, contentFormat: undefined, fieldLabels: {} });
    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ attemptCount: 1, status: "completed" }]);
  });

  test("sends one shared Email Confirmation and waits for its confirmation", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Verify", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({
      blocking: true,
      conditionMissBehavior: "skip_action",
      configurationJson: JSON.stringify({
        booleanField: "email.verified",
        emailCtaLabel: "Open confirmation",
        emailField: "email",
        emailText: "Hi {{payload.name}}.",
        subject: "Confirmation required",
        timeoutHours: 24,
      }),
      createdAt: now,
      pipelineId: "flow-1",
      enabled: true,
      id: "action-1",
      maximumAttempts: 3,
      name: "Verify e-mail",
      position: 1,
      type: "email_confirmation",
      updatedAt: now,
    }).run();
    const prepared = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test", name: "Ada" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test","name":"Ada"}', sourceId: source.id }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    const sendConfirmationEmail = vi.fn().mockResolvedValue(undefined);
    await runPipelines({
      baseUrl: "https://forman.example.test",
      confirmationSecret: "a secret that is long enough for the test",
      database: database.db,
      now,
      sendConfirmationEmail,
    });

    const action = database.db.select().from(pipelineActionRuns).get()!;
    expect(action).toMatchObject({ attemptCount: 1, errorSummary: "Confirmation email sent.", status: "waiting_callback" });
    expect(sendConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({
      ctaLabel: "Open confirmation",
      recipient: "person@example.test",
      subject: "Confirmation required",
      text: "Hi Ada.",
      url: expect.stringMatching(/^https:\/\/forman\.example\.test\/confirmations\//),
    }));

    const url = sendConfirmationEmail.mock.calls[0]![0].url as string;
    const capability = url.split("/").at(-1)!;
    expect(getPublicEmailConfirmation(database.db, capability, now)).toMatchObject({
      confirmationCtaLabel: "Confirm",
      confirmationText: "Confirm continuation.",
    });
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ status: "waiting_callback" }]);
    expect(confirmEmailConfirmation(database.db, capability, now)).toEqual({
      completedText: "Confirmation has been received. This page can now be closed.",
    });
    expect(database.db.select().from(emailConfirmationSessions).all()).toMatchObject([{ status: "confirmed" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{
      outputPayloadJson: '{"email":"person@example.test","name":"Ada","email.verified":true}',
      status: "completed",
    }]);
  });

  test("shares a waiting Email Confirmation for the same Data Source, Pipeline, and recipient", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-03T10:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Verify", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({ blocking: true, conditionMissBehavior: "skip_action", configurationJson: JSON.stringify({ booleanField: "email.verified", emailField: "email", timeoutHours: 24 }), createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 3, name: "Verify e-mail", position: 1, type: "email_confirmation", updatedAt: now }).run();
    const first = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test" }, sourceId: source.id });
    const second = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "PERSON@example.test" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values([
        { createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id },
        { createdAt: now, id: "submission-2", payloadJson: '{"email":"PERSON@example.test"}', sourceId: source.id },
      ]).run();
      insertPreparedPipelineRuns(transaction, "submission-1", first);
      insertPreparedPipelineRuns(transaction, "submission-2", second);
    });

    const sendConfirmationEmail = vi.fn().mockResolvedValue(undefined);
    await runPipelines({ baseUrl: "https://forman.example.test", confirmationSecret: "a secret that is long enough for the test", database: database.db, now, sendConfirmationEmail });

    expect(sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(database.db.select().from(emailConfirmationSessions).all()).toHaveLength(1);
    expect(database.db.select().from(pipelineActionRuns).all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ errorSummary: "A confirmation email has already been sent for this Source and Pipeline.", status: "waiting_callback" }),
      expect.objectContaining({ errorSummary: "Confirmation email sent.", status: "waiting_callback" }),
    ]));
  });

  test("completes with attention when a non-blocking E-mail Action fails permanently", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-02T10:00:00.000Z");
    database.db.insert(pipelines).values({ createdAt: now, enabled: true, id: "flow-1", name: "Process", sourceId: source.id, updatedAt: now }).run();
    database.db.insert(pipelineActions).values({ blocking: false, conditionMissBehavior: "skip_action", configurationJson: '{"recipients":["sales@example.test"]}', createdAt: now, pipelineId: "flow-1", enabled: true, id: "action-1", maximumAttempts: 1, name: "Notify sales", position: 1, type: "email", updatedAt: now }).run();
    const prepared = await preparePipelineRuns(database.db, { createdAt: now, payload: { email: "person@example.test" }, sourceId: source.id });
    database.db.transaction((transaction) => {
      transaction.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
      insertPreparedPipelineRuns(transaction, "submission-1", prepared);
    });

    await runPipelines({ database: database.db, now, sendEmail: async () => { throw new Error("SMTP unavailable"); } });

    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed_attention" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ attemptCount: 1, status: "failed" }]);
  });

  test("consumes a Callback token once and merges its payload patch", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date();
    database.db.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, pipelineId: null, pipelineName: "Process", id: "run-1", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission-1", updatedAt: now }).run();
    database.db.insert(pipelineActionRuns).values({ actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: new Date(now.getTime() + 60_000), callbackToken: "callback-token", conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, failurePolicy: "cancel", id: "action-1", inputPayloadJson: '{"email":"person@example.test"}', maximumAttempts: 3, name: "Verify", position: 1, runId: "run-1", status: "waiting_callback", type: "callback", updatedAt: now }).run();

    const request = new Request("https://forman.example.test/api/pipelines/callback/callback-token", { body: '{"action":"continue","payload":{"verified":true}}', headers: { "content-type": "application/json" }, method: "POST" });
    expect((await acceptPipelineCallback(database.db, "callback-token", request)).status).toBe(204);
    expect((await acceptPipelineCallback(database.db, "callback-token", new Request("https://forman.example.test/api/pipelines/callback/callback-token", { body: "{}", headers: { "content-type": "application/json" }, method: "POST" }))).status).toBe(410);
    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed" }]);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ callbackToken: null, outputPayloadJson: '{"email":"person@example.test","verified":true}', status: "completed" }]);
  });

  test("Callback Touch sends a one-time URL and marks its configured payload field on GET", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date();
    database.db.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, pipelineId: null, pipelineName: "Process", id: "run-1", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission-1", updatedAt: now }).run();
    database.db.insert(pipelineActionRuns).values({ actionId: null, attemptCount: 0, blocking: true, conditionMissBehavior: "skip_action", configurationJson: '{"field":"email.verified","timeoutSeconds":60,"url":"https://verify.example.test"}', createdAt: now, failurePolicy: "cancel", id: "action-1", inputPayloadJson: '{"email":"person@example.test"}', maximumAttempts: 3, name: "Verify email", position: 1, runId: "run-1", status: "pending", type: "callback_boolean", updatedAt: now }).run();
    const sendWebhook = vi.fn().mockResolvedValue({ body: "", status: 202 });

    await runPipelines({ baseUrl: "https://forman.example.test", database: database.db, now, sendWebhook });

    const waiting = database.db.select().from(pipelineActionRuns).get()!;
    expect(waiting).toMatchObject({ attemptCount: 1, status: "waiting_callback" });
    expect(JSON.parse(sendWebhook.mock.calls[0]![0].body)).toEqual({
      meta: { callbackUrl: `https://forman.example.test/api/pipelines/callback/${waiting.callbackToken}` },
      payload: { email: "person@example.test" },
    });

    expect((await acceptPipelineCallback(database.db, waiting.callbackToken!, new Request(`https://forman.example.test/api/pipelines/callback/${waiting.callbackToken}`, { method: "GET" }))).status).toBe(204);
    expect(database.db.select().from(pipelineActionRuns).all()).toMatchObject([{ outputPayloadJson: '{"email":"person@example.test","email.verified":true}', status: "completed" }]);
  });

  test("uses the configured SSRF protection setting for Callback delivery", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-02T17:00:00.000Z");
    await getGlobalSettings(database.db);
    await updateGlobalSettings(database.db, { webhookSsrfProtectionEnabled: false });
    database.db.insert(submissions).values({
      createdAt: now,
      id: "submission-1",
      payloadJson: '{"test":1}',
      sourceId: source.id,
    }).run();
    database.db.insert(pipelineRuns).values({
      createdAt: now,
      pipelineId: null,
      pipelineName: "Process",
      id: "run-1",
      snapshotJson: "{}",
      sourceId: source.id,
      status: "pending",
      submissionId: "submission-1",
      updatedAt: now,
    }).run();
    database.db.insert(pipelineActionRuns).values({
      actionId: null,
      attemptCount: 0,
      blocking: true,
      conditionMissBehavior: "skip_action",
      configurationJson: '{"timeoutSeconds":60,"url":"https://webhook.test"}',
      createdAt: now,
      failurePolicy: "cancel",
      id: "action-1",
      inputPayloadJson: '{"test":1}',
      maximumAttempts: 1,
      name: "Await callback",
      position: 1,
      runId: "run-1",
      status: "pending",
      type: "callback",
      updatedAt: now,
    }).run();

    const sendWebhook = vi.fn().mockResolvedValue({ body: "", status: 202 });
    await runPipelines({
      baseUrl: "https://forman.example.test",
      database: database.db,
      now,
      sendWebhook,
    });

    expect(sendWebhook).toHaveBeenCalledWith(expect.objectContaining({
      ssrfProtectionEnabled: false,
    }));
  });

  test("cancels a Callback Run and marks its remaining Actions as not run", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date();
    database.db.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, pipelineId: null, pipelineName: "Process", id: "run-1", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission-1", updatedAt: now }).run();
    database.db.insert(pipelineActionRuns).values([
      { actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: new Date(now.getTime() + 60_000), callbackToken: "callback-token", conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, failurePolicy: "cancel", id: "action-1", inputPayloadJson: '{"email":"person@example.test"}', maximumAttempts: 3, name: "Verify", position: 1, runId: "run-1", status: "waiting_callback", type: "callback", updatedAt: now },
      { actionId: null, attemptCount: 0, blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, failurePolicy: null, id: "action-2", inputPayloadJson: '{}', maximumAttempts: 3, name: "Archive", position: 2, runId: "run-1", status: "not_run", type: "inbox", updatedAt: now },
    ]).run();

    const response = await acceptPipelineCallback(database.db, "callback-token", new Request("https://forman.example.test/api/pipelines/callback/callback-token", { body: '{"action":"cancel"}', headers: { "content-type": "application/json" }, method: "POST" }));

    expect(response.status).toBe(204);
    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "cancelled" }]);
    expect(database.db.select().from(pipelineActionRuns).orderBy(pipelineActionRuns.position).all()).toMatchObject([
      { callbackToken: null, errorSummary: "Cancelled by Callback.", outputPayloadJson: null, status: "cancelled" },
      { status: "not_run" },
    ]);
  });

  test("expires a Callback into bypass and continues with the next Action", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date();
    database.db.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, pipelineId: null, pipelineName: "Process", id: "run-1", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission-1", updatedAt: now }).run();
    database.db.insert(pipelineActionRuns).values([
      { actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: new Date(now.getTime() - 1), callbackToken: "expired", conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, failurePolicy: "bypass", id: "action-1", inputPayloadJson: '{"email":"person@example.test"}', maximumAttempts: 1, name: "Verify", position: 1, runId: "run-1", status: "waiting_callback", type: "callback", updatedAt: now },
      { actionId: null, attemptCount: 0, blocking: false, conditionMissBehavior: "skip_action", configurationJson: "{}", createdAt: now, failurePolicy: null, id: "action-2", inputPayloadJson: '{}', maximumAttempts: 1, name: "Archive", position: 2, runId: "run-1", status: "not_run", type: "inbox", updatedAt: now },
    ]).run();

    await runPipelines({ database: database.db, now });

    expect(database.db.select().from(pipelineRuns).all()).toMatchObject([{ status: "completed" }]);
    expect(database.db.select().from(pipelineActionRuns).orderBy(pipelineActionRuns.position).all()).toMatchObject([{ status: "bypassed" }, { status: "completed" }]);
  });

  test("reissues an expired Callback with a new capability while attempts remain", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const now = new Date("2026-09-02T10:00:00.000Z");
    database.db.insert(submissions).values({ createdAt: now, id: "submission-1", payloadJson: '{"email":"person@example.test"}', sourceId: source.id }).run();
    database.db.insert(pipelineRuns).values({ createdAt: now, pipelineId: null, pipelineName: "Process", id: "run-1", snapshotJson: "{}", sourceId: source.id, status: "processing", submissionId: "submission-1", updatedAt: now }).run();
    database.db.insert(pipelineActionRuns).values({ actionId: null, attemptCount: 1, blocking: true, callbackExpiresAt: new Date(now.getTime() - 1), callbackToken: "expired-token", conditionMissBehavior: "skip_action", configurationJson: '{"timeoutSeconds":60,"url":"https://verify.example.test"}', createdAt: now, failurePolicy: "cancel", id: "action-1", inputPayloadJson: '{"email":"person@example.test"}', maximumAttempts: 2, name: "Verify", position: 1, runId: "run-1", status: "waiting_callback", type: "callback", updatedAt: now }).run();
    const sendWebhook = vi.fn().mockResolvedValue({ body: "", status: 202 });

    await runPipelines({ baseUrl: "https://forman.example.test", database: database.db, now, sendWebhook });

    expect(database.db.select().from(pipelineActionRuns).get()).toMatchObject({ attemptCount: 1, status: "retry_scheduled" });
    await runPipelines({ baseUrl: "https://forman.example.test", database: database.db, now: new Date(now.getTime() + 5_000), sendWebhook });

    const action = database.db.select().from(pipelineActionRuns).get()!;
    expect(action).toMatchObject({ attemptCount: 2, callbackExpiresAt: new Date(now.getTime() + 65_000), errorSummary: null, status: "waiting_callback" });
    expect(action.callbackToken).not.toBe("expired-token");
    expect(JSON.parse(sendWebhook.mock.calls[0]![0].body).meta.callbackUrl).toContain(action.callbackToken);
    expect((await acceptPipelineCallback(database.db, "expired-token", new Request("https://forman.example.test/api/pipelines/callback/expired-token", { body: '{"action":"continue","payload":{}}', headers: { "content-type": "application/json" }, method: "POST" }))).status).toBe(410);
  });
});
