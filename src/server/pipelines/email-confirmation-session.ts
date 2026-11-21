import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { createHash, createHmac, randomBytes } from "node:crypto";

import type { createDatabase } from "@/server/db/client";
import {
  emailConfirmationSessionActions,
  emailConfirmationSessions,
  pipelineActionRuns,
  pipelineRuns,
  submissions,
} from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import {
  canonicalEmailRecipient,
  normalizeEmailConfirmationConfiguration,
  renderEmailConfirmationText,
  type EmailConfirmationConfiguration,
} from "@/server/pipelines/email-confirmation";
import type { SubmissionPayload } from "@/shared/contracts/submission";
import { advancePipelineAction, failPipelineAction } from "@/server/pipelines/pipeline-action-transitions";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type FormanTransaction = Parameters<Parameters<FormanDatabase["transaction"]>[0]>[0];
type ActionRun = typeof pipelineActionRuns.$inferSelect;

export type ConfirmationEmail = {
  ctaLabel: string;
  recipient: string;
  subject: string;
  text: string;
  url: string;
};

type StartedConfirmation =
  | { kind: "attached" }
  | { kind: "owner"; email: ConfirmationEmail; sessionId: string };

function capabilityHash(capability: string) {
  return createHash("sha256").update(capability).digest("base64url");
}

function recipientFingerprint(recipient: string, secret: string) {
  return createHmac("sha256", secret).update(recipient).digest("base64url");
}

function payloadFor(action: ActionRun) {
  return JSON.parse(action.inputPayloadJson) as SubmissionPayload;
}

function configurationFor(action: ActionRun) {
  return normalizeEmailConfirmationConfiguration(JSON.parse(action.configurationJson));
}

function templateContext(database: Pick<FormanDatabase, "select">, action: ActionRun) {
  const run = database.select().from(pipelineRuns).where(eq(pipelineRuns.id, action.runId)).get();
  const submission = run
    ? database.select().from(submissions).where(eq(submissions.id, run.submissionId)).get()
    : null;
  return {
    meta: {
      sessionUpdateCount: submission?.sessionUpdateCount ?? null,
      sessionRequestCount: submission?.sessionRequestCount ?? null,
      clientIp: submission?.clientIp ?? null,
      referer: submission?.referer ?? null,
      submissionId: submission?.id ?? null,
      submittedAt: submission?.createdAt?.toISOString() ?? null,
      userAgent: submission?.userAgent ?? null,
    },
    payload: payloadFor(action) as Record<string, unknown>,
  };
}

function emailFor(configuration: EmailConfirmationConfiguration, input: SubmissionPayload, url: string, context: ReturnType<typeof templateContext>): ConfirmationEmail {
  return {
    ctaLabel: renderEmailConfirmationText(configuration.emailCtaLabel, context),
    recipient: canonicalEmailRecipient(input[configuration.emailField])!,
    subject: renderEmailConfirmationText(configuration.subject, context),
    text: renderEmailConfirmationText(configuration.emailText, context),
    url,
  };
}

export function startEmailConfirmation(
  database: FormanDatabase,
  {
    action,
    baseUrl,
    now,
    secret,
  }: { action: ActionRun; baseUrl: string; now: Date; secret: string },
): StartedConfirmation {
  const configuration = configurationFor(action);
  const input = payloadFor(action);
  const recipient = canonicalEmailRecipient(input[configuration.emailField]);
  if (!recipient) throw new Error("Email Confirmation recipient must be a valid e-mail address");
  const run = database.select().from(pipelineRuns).where(eq(pipelineRuns.id, action.runId)).get();
  if (!run?.pipelineId) throw new Error("Email Confirmation requires a configured Data Pipeline");
  const fingerprint = recipientFingerprint(recipient, secret);
  const capability = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + configuration.timeoutHours * 60 * 60 * 1_000);

  return database.transaction((transaction) => {
    // The Action may be retrying an expired session. Keep only its current attachment.
    transaction.delete(emailConfirmationSessionActions).where(eq(emailConfirmationSessionActions.actionRunId, action.id)).run();
    const existing = transaction.select().from(emailConfirmationSessions).where(and(
      eq(emailConfirmationSessions.sourceId, run.sourceId),
      eq(emailConfirmationSessions.pipelineId, run.pipelineId!),
      eq(emailConfirmationSessions.recipientFingerprint, fingerprint),
      eq(emailConfirmationSessions.status, "waiting"),
      gt(emailConfirmationSessions.expiresAt, now),
    )).get();
    if (existing) {
      transaction.insert(emailConfirmationSessionActions).values({ actionRunId: action.id, sessionId: existing.id }).run();
      transaction.update(pipelineActionRuns).set({
        errorSummary: "A confirmation email has already been sent for this Source and Pipeline.",
        status: "waiting_callback",
        updatedAt: now,
      }).where(eq(pipelineActionRuns.id, action.id)).run();
      return { kind: "attached" } as const;
    }
    const sessionId = createResourceId();
    transaction.insert(emailConfirmationSessions).values({
      capabilityHash: capabilityHash(capability),
      createdAt: now,
      expiresAt,
      id: sessionId,
      ownerActionRunId: action.id,
      pipelineId: run.pipelineId!,
      recipientFingerprint: fingerprint,
      sourceId: run.sourceId,
      status: "waiting",
      updatedAt: now,
    }).run();
    transaction.insert(emailConfirmationSessionActions).values({ actionRunId: action.id, sessionId }).run();
    transaction.update(pipelineActionRuns).set({
      errorSummary: null,
      status: "processing",
      updatedAt: now,
    }).where(eq(pipelineActionRuns.id, action.id)).run();
    return {
      kind: "owner",
      email: emailFor(configuration, input, new URL(`/confirmations/${capability}`, baseUrl).toString(), templateContext(transaction, action)),
      sessionId,
    } as const;
  });
}

export function markEmailConfirmationSent(database: FormanDatabase, actionId: string, now: Date) {
  database.update(pipelineActionRuns).set({
    errorSummary: "Confirmation email sent.",
    status: "waiting_callback",
    updatedAt: now,
  }).where(and(eq(pipelineActionRuns.id, actionId), eq(pipelineActionRuns.status, "processing"))).run();
}

export function abandonEmailConfirmation(database: Pick<FormanDatabase, "transaction">, sessionId: string, now = new Date()) {
  database.transaction((transaction) => {
    const session = transaction.select().from(emailConfirmationSessions).where(and(eq(emailConfirmationSessions.id, sessionId), eq(emailConfirmationSessions.status, "waiting"))).get();
    if (!session) return;
    const attached = transaction.select({ action: pipelineActionRuns }).from(emailConfirmationSessionActions)
      .innerJoin(pipelineActionRuns, eq(emailConfirmationSessionActions.actionRunId, pipelineActionRuns.id))
      .where(and(eq(emailConfirmationSessionActions.sessionId, sessionId), inArray(pipelineActionRuns.status, ["processing", "waiting_callback"]))).all();
    transaction.delete(emailConfirmationSessions).where(eq(emailConfirmationSessions.id, sessionId)).run();
    for (const { action } of attached) failPipelineAction(transaction, action, "Confirmation e-mail delivery failed or was interrupted.", now);
  });
}

function expireAction(transaction: FormanTransaction, action: ActionRun, now: Date) {
  // Human confirmation timeout is final; only delivery failures retry automatically.
  failPipelineAction(transaction, action, "Confirmation link expired.", now, { terminal: true });
}

export type PublicEmailConfirmation = {
  confirmationCtaLabel: string;
  confirmationText: string;
  completedText: string;
};

export function getPublicEmailConfirmation(database: FormanDatabase, capability: string, now = new Date()): PublicEmailConfirmation | null {
  const session = database.select().from(emailConfirmationSessions).where(and(
    eq(emailConfirmationSessions.capabilityHash, capabilityHash(capability)),
    eq(emailConfirmationSessions.status, "waiting"),
    gt(emailConfirmationSessions.expiresAt, now),
  )).get();
  if (!session) return null;
  const action = database.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id, session.ownerActionRunId)).get();
  if (!action) return null;
  const configuration = configurationFor(action);
  const context = templateContext(database, action);
  return {
    completedText: renderEmailConfirmationText(configuration.completedText, context),
    confirmationCtaLabel: renderEmailConfirmationText(configuration.confirmationCtaLabel, context),
    confirmationText: renderEmailConfirmationText(configuration.confirmationText, context),
  };
}

export function confirmEmailConfirmation(database: FormanDatabase, capability: string, now = new Date()) {
  return database.transaction((transaction) => {
    const session = transaction.select().from(emailConfirmationSessions).where(and(
      eq(emailConfirmationSessions.capabilityHash, capabilityHash(capability)),
      eq(emailConfirmationSessions.status, "waiting"),
      gt(emailConfirmationSessions.expiresAt, now),
    )).get();
    if (!session) return null;
    const consumed = transaction.update(emailConfirmationSessions).set({
      confirmedAt: now,
      status: "confirmed",
      updatedAt: now,
    }).where(and(eq(emailConfirmationSessions.id, session.id), eq(emailConfirmationSessions.status, "waiting"))).run();
    if (consumed.changes !== 1) return null;
    const attached = transaction.select({ action: pipelineActionRuns }).from(emailConfirmationSessionActions)
      .innerJoin(pipelineActionRuns, eq(emailConfirmationSessionActions.actionRunId, pipelineActionRuns.id))
      .where(and(eq(emailConfirmationSessionActions.sessionId, session.id), inArray(pipelineActionRuns.status, ["processing", "waiting_callback"]))).all();
    for (const { action } of attached) {
      const configuration = configurationFor(action);
      const output = { ...payloadFor(action), [configuration.booleanField]: true } as SubmissionPayload;
      transaction.update(pipelineActionRuns).set({
        errorSummary: null,
        outputPayloadJson: JSON.stringify(output),
        status: "completed",
        updatedAt: now,
      }).where(eq(pipelineActionRuns.id, action.id)).run();
      advancePipelineAction(transaction, action, output, now);
    }
    const owner = transaction.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.id, session.ownerActionRunId)).get();
    if (!owner) return null;
    const configuration = configurationFor(owner);
    const context = templateContext(transaction, owner);
    return {
      completedText: renderEmailConfirmationText(configuration.completedText, context),
    };
  });
}

export function expireEmailConfirmations(database: FormanDatabase, now = new Date()) {
  const expired = database.select().from(emailConfirmationSessions).where(and(
    eq(emailConfirmationSessions.status, "waiting"),
    lte(emailConfirmationSessions.expiresAt, now),
  )).all();
  for (const session of expired) {
    database.transaction((transaction) => {
      const updated = transaction.update(emailConfirmationSessions).set({ status: "expired", updatedAt: now })
        .where(and(eq(emailConfirmationSessions.id, session.id), eq(emailConfirmationSessions.status, "waiting"))).run();
      if (updated.changes !== 1) return;
      const attached = transaction.select({ action: pipelineActionRuns }).from(emailConfirmationSessionActions)
        .innerJoin(pipelineActionRuns, eq(emailConfirmationSessionActions.actionRunId, pipelineActionRuns.id))
        .where(and(eq(emailConfirmationSessionActions.sessionId, session.id), inArray(pipelineActionRuns.status, ["waiting_callback", "processing"]))).all();
      for (const { action } of attached) expireAction(transaction, action, now);
    });
  }
  return expired.length;
}
