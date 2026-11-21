import { sourceById } from "@/server/sources/source-configuration-document";
import { parseJsonSchema } from "@/shared/source-fields-definition";
import { renderWebhookUrl, webhookAuthorization } from "./webhook-configuration";
import { archiveToCouchDb } from "./couchdb-action";
import { and, asc, eq, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import type { createDatabase } from "@/server/db/client";
import { pipelineRuns, pipelineActionRuns, configuredInboxItems, submissions, sources, emailConfirmationSessions } from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import { transformEnvelope } from "@/server/flows/jsonata-transform";
import { sendHttpActionRequest, type HttpActionRequestInput } from "@/server/pipelines/http-action";
import { getGlobalSettings } from "@/server/config/global-settings";
import { getCompleteSmtpSettings, smtpSender, smtpTransportOptions } from "@/server/config/smtp-settings";
import { sendEmailConfirmation, sendPipelineEmail } from "@/server/pipelines/email-action";
import { abandonEmailConfirmation, expireEmailConfirmations, markEmailConfirmationSent, startEmailConfirmation, type ConfirmationEmail } from "@/server/pipelines/email-confirmation-session";
import { actionPayload, completePipelineAction, failPipelineAction, refreshPipelineStatus, stopRemainingPipelineActions, type ActionRun } from "@/server/pipelines/pipeline-action-transitions";
import { matchesStoredActionCondition } from "@/shared/contracts/action-condition";
import { submissionPayloadSchema, type SubmissionPayload } from "@/shared/contracts/submission";
import { WebhookExecutionError } from "@/server/pipelines/webhook-errors";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type EmailInput = { payload: SubmissionPayload; recipients: string[]; subject?: string; contentFormat?: "formatted" | "json"; fieldLabels?: Record<string, string> };
type WorkerInput = {
  runId?: string;
  baseUrl?: string;
  confirmationSecret?: string;
  database: FormanDatabase;
  now?: Date;
  sendWebhook?: (input: HttpActionRequestInput) => ReturnType<typeof sendHttpActionRequest>;
  sendEmail?: (input: EmailInput) => Promise<void>;
  sendConfirmationEmail?: (input: ConfirmationEmail) => Promise<void>;
};

function flatPatch(value: unknown) {
  const parsed = submissionPayloadSchema.safeParse(value);
  if (!parsed.success) throw new Error("Action output must be a flat payload");
  return parsed.data;
}

// Run only during startup, before scheduling work: this deployment has one application replica.
export function recoverInterruptedPipelineActions(database: FormanDatabase, now = new Date()) {
  const interrupted = database.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.status, "processing")).all();
  for (const action of interrupted) {
    database.transaction((transaction) => {
      if (action.type === "email_confirmation") {
        const session = transaction.select().from(emailConfirmationSessions).where(and(eq(emailConfirmationSessions.ownerActionRunId, action.id), eq(emailConfirmationSessions.status, "waiting"))).get();
        if (session) abandonEmailConfirmation(transaction, session.id, now);
      }
      failPipelineAction(transaction, action, "Action interrupted by application restart.", now);
    });
  }
  return interrupted.length;
}

async function executeAction(input: WorkerInput, action: ActionRun, clock: () => Date, sendWebhook: NonNullable<WorkerInput["sendWebhook"]>, sendEmail: NonNullable<WorkerInput["sendEmail"]>, sendConfirmation: NonNullable<WorkerInput["sendConfirmationEmail"]>) {
  const { database, baseUrl = "http://localhost", confirmationSecret = "" } = input;
  const payload = actionPayload(action);
  if (!matchesStoredActionCondition(payload, action.conditionJson)) {
    if (action.conditionMissBehavior === "skip_remaining") {
      database.transaction((transaction) => {
        const now = clock();
        transaction.update(pipelineActionRuns).set({ outputPayloadJson: JSON.stringify(payload), status: "skipped_condition", nextAttemptAt: null, updatedAt: now }).where(eq(pipelineActionRuns.id, action.id)).run();
        stopRemainingPipelineActions(transaction, action, now);
        refreshPipelineStatus(transaction, action.runId, now);
      });
    } else completePipelineAction(database, action, payload, clock(), "skipped_condition");
    return;
  }
  const configuration = JSON.parse(action.configurationJson);
  const run = database.select({ snapshot: pipelineRuns.snapshotJson, submissionId: pipelineRuns.submissionId, sourceId: pipelineRuns.sourceId }).from(pipelineRuns).where(eq(pipelineRuns.id, action.runId)).get();
  const sessionMeta = run ? JSON.parse(run.snapshot).meta ?? {} : {};
  if (action.type === "transformation") {
    const patch = flatPatch(await transformEnvelope(payload, configuration.expression, { meta: sessionMeta }));
    completePipelineAction(database, action, { ...payload, ...patch }, clock());
  } else if (action.type === "inbox") {
    database.transaction((transaction) => {
      const run = transaction.select().from(pipelineRuns).where(eq(pipelineRuns.id, action.runId)).get();
      const source = run ? transaction.select({ name: sources.name }).from(sources).where(eq(sources.id, run.sourceId)).get() : null;
      if (!run || !source) throw new Error("Pipeline Run source is unavailable");
      const now = clock();
      transaction.insert(configuredInboxItems).values({ actionName: action.name, createdAt: now, pipelineActionRunId: action.id, id: createResourceId(), payloadJson: JSON.stringify(payload), sourceId: run.sourceId, sourceName: source.name, submissionId: run.submissionId, updatedAt: now }).onConflictDoNothing().run();
      completePipelineAction(transaction, action, payload, now);
    });
  } else if (action.type === "couchdb") {
    const archiveRun = database.select().from(pipelineRuns).where(eq(pipelineRuns.id, action.runId)).get();
    const submission = archiveRun ? database.select().from(submissions).where(eq(submissions.id, archiveRun.submissionId)).get() : undefined;
    const source = archiveRun ? database.select().from(sources).where(eq(sources.id, archiveRun.sourceId)).get() : undefined;
    if (!submission || !source) throw new Error("CouchDB archive input unavailable");
    await archiveToCouchDb(configuration, { _id: `submission:${submission.id}`, version: 1, sourceId: source.sourceId, submissionId: submission.id, createdAt: submission.createdAt.toISOString(), payload: JSON.parse(submission.payloadJson) }, sendWebhook);
    completePipelineAction(database, action, payload, clock());
  } else if (action.type === "webhook") {
    let response: Awaited<ReturnType<typeof sendHttpActionRequest>>;
    try {
      const method = configuration.method ?? "POST";
      const source = run ? database.select({sourceId:sources.sourceId}).from(sources).where(eq(sources.id,run.sourceId)).get() : undefined;
      const url = renderWebhookUrl(configuration.url, {...sessionMeta, submissionId:run?.submissionId, sourceId:source?.sourceId, runId:action.runId, actionRunId:action.id}, payload);
      response = await sendWebhook({ method, body: method === "GET" || method === "HEAD" ? "" : JSON.stringify(payload), headers: { ...webhookAuthorization(configuration), "content-type": "application/json", "idempotency-key": action.id }, url });
    } catch {
      throw new WebhookExecutionError("connection");
    }
    if (response.status < 200 || response.status >= 300) throw new WebhookExecutionError("http");
    let value: unknown;
    try {
      value = response.body?.trim() ? JSON.parse(response.body) : {};
    } catch {
      throw new WebhookExecutionError("json");
    }
    const patch = submissionPayloadSchema.safeParse(value);
    if (!patch.success) throw new WebhookExecutionError("shape");
    completePipelineAction(database, action, { ...payload, ...patch.data }, clock());
  } else if (action.type === "callback" || action.type === "callback_boolean") {
    const token = randomBytes(32).toString("base64url");
    const now = clock();
    database.update(pipelineActionRuns).set({ callbackExpiresAt: new Date(now.getTime() + configuration.timeoutSeconds * 1_000), callbackToken: token, updatedAt: now }).where(and(eq(pipelineActionRuns.id, action.id), eq(pipelineActionRuns.status, "processing"))).run();
    const response = await sendWebhook({ body: JSON.stringify({ meta: { ...sessionMeta, callbackUrl: new URL(`/api/pipelines/callback/${token}`, baseUrl).toString() }, payload }), headers: { "content-type": "application/json", "idempotency-key": action.id }, url: configuration.url });
    if (response.status < 200 || response.status >= 300) throw new Error("Callback delivery failed");
    database.update(pipelineActionRuns).set({ status: "waiting_callback", updatedAt: clock() }).where(and(eq(pipelineActionRuns.id, action.id), eq(pipelineActionRuns.status, "processing"), eq(pipelineActionRuns.callbackToken, token))).run();
  } else if (action.type === "email") {
    const source = run && configuration.contentFormat === "formatted" ? sourceById(database, run.sourceId) : null;
    const properties = source?.fieldDefinitionSource ? parseJsonSchema(source.fieldDefinitionSource).properties : {};
    const fieldLabels = Object.fromEntries(Object.entries(properties)
      .filter(([, field]) => typeof field.title === "string" && field.title.trim())
      .map(([key, field]) => [key, field.title as string]));
    await sendEmail({ payload, recipients: configuration.recipients,
      subject: configuration.subject, contentFormat: configuration.contentFormat, fieldLabels });
    completePipelineAction(database, action, payload, clock());
  } else if (action.type === "email_confirmation") {
    if (!confirmationSecret) throw new Error("Email Confirmation requires the Forman session secret");
    const started = startEmailConfirmation(database, { action, baseUrl, now: clock(), secret: confirmationSecret });
    if (started.kind === "attached") return;
    try {
      await sendConfirmation(started.email);
      markEmailConfirmationSent(database, action.id, clock());
    } catch (error) {
      // Confirmation may have completed before SMTP returned; do not revoke that result.
      if (database.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id, action.id)).get()?.status === "processing") abandonEmailConfirmation(database, started.sessionId, clock());
      throw error;
    }
  } else throw new Error("Unsupported Action type");
}

async function runCycle(input: WorkerInput) {
  const { database } = input;
  const clock = input.now ? () => input.now! : () => new Date();
  const settings = await getGlobalSettings(database);
  const sendWebhook = (request: HttpActionRequestInput) => (input.sendWebhook ?? sendHttpActionRequest)({ ...request, ssrfProtectionEnabled: settings.webhookSsrfProtectionEnabled });
  const smtpTransport = async () => {
    const smtp = await getCompleteSmtpSettings(database);
    if (!smtp) throw new Error("SMTP transport is not configured");
    return { from: smtpSender(smtp), transport: nodemailer.createTransport(smtpTransportOptions(smtp)) };
  };
  const sendEmail = input.sendEmail ?? (async ({ payload, recipients, subject, contentFormat, fieldLabels }: EmailInput) => {
    const { from, transport } = await smtpTransport();
    await sendPipelineEmail({ from, payloadJson: JSON.stringify(payload), recipients, subject, contentFormat, fieldLabels, sendMail: (message) => transport.sendMail(message) });
  });
  const sendConfirmation = input.sendConfirmationEmail ?? (async (email: ConfirmationEmail) => {
    const { from, transport } = await smtpTransport();
    await sendEmailConfirmation({ ...email, from, sendMail: (message) => transport.sendMail(message) });
  });
  if (!input.runId) expireEmailConfirmations(database, clock());
  const expired = database.select().from(pipelineActionRuns).where(and(input.runId ? eq(pipelineActionRuns.runId, input.runId) : undefined, eq(pipelineActionRuns.status, "waiting_callback"), lte(pipelineActionRuns.callbackExpiresAt, clock()))).all();
  for (const action of expired) failPipelineAction(database, action, "Callback expired", clock());
  let executed = 0;
  const active = new Map<string, Promise<void>>();
  const concurrency = 4;
  try {
    while (true) {
      while (active.size < concurrency) {
        const now = clock();
        const due = and(inArray(pipelineActionRuns.status, ["pending", "retry_scheduled"]), or(isNull(pipelineActionRuns.nextAttemptAt), lte(pipelineActionRuns.nextAttemptAt, now)));
        // One in-flight action per run; independent runs use the other slots.
        const candidate = database.select().from(pipelineActionRuns)
          .where(and(due, input.runId ? eq(pipelineActionRuns.runId, input.runId) : undefined, active.size ? notInArray(pipelineActionRuns.runId, [...active.keys()]) : undefined))
          .orderBy(asc(pipelineActionRuns.createdAt), asc(pipelineActionRuns.position), asc(pipelineActionRuns.id)).limit(1).get();
        if (!candidate) break;
        const action = database.transaction((transaction) => {
          const claimed = transaction.update(pipelineActionRuns).set({ attemptCount: sql`${pipelineActionRuns.attemptCount} + 1`, status: "processing", errorSummary: null, nextAttemptAt: null, updatedAt: clock() }).where(and(eq(pipelineActionRuns.id, candidate.id), due, lt(pipelineActionRuns.attemptCount, pipelineActionRuns.maximumAttempts))).returning().get();
          if (claimed) transaction.update(pipelineRuns).set({ status: "processing", updatedAt: clock() }).where(eq(pipelineRuns.id, claimed.runId)).run();
          return claimed;
        });
        if (!action) {
          // Also settle exhausted legacy retry rows, without making another delivery.
          if (candidate.attemptCount >= candidate.maximumAttempts) failPipelineAction(database, candidate, "Action attempt limit reached.", clock());
          continue;
        }
        const task = (async () => {
          try { await executeAction(input, action, clock, sendWebhook, sendEmail, sendConfirmation); }
          catch (error) { failPipelineAction(database, action, error instanceof WebhookExecutionError ? error.message : "Action execution failed. Check its configuration and destination.", clock()); }
          executed++;
        })();
        active.set(action.runId, task);
      }
      if (active.size === 0) return executed;
      const completedRun = await Promise.race([...active].map(async ([runId, task]) => { await task; return runId; }));
      active.delete(completedRun);
    }
  } finally {
    // A cycle owns its work until every action settles, also on database errors.
    await Promise.allSettled(active.values());
  }
}

const activeCycles = new WeakMap<FormanDatabase, Promise<number>>();
export function runPipelines(input: WorkerInput): Promise<number> {
  const existing = activeCycles.get(input.database);
  if (existing) return existing;
  const cycle = runCycle(input).finally(() => { activeCycles.delete(input.database); });
  activeCycles.set(input.database, cycle);
  return cycle;
}

// Scoped execution does not drain unrelated work. Database claims still arbitrate
// against the regular scheduler if it is already processing the same run.
export function runPipeline(input: WorkerInput & { runId: string }): Promise<number> {
  return runCycle(input);
}
