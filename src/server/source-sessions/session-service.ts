import { sourceById } from "@/server/sources/source-configuration-document";
import { createHash } from "node:crypto";
import { and, eq, lte, ne, sql } from "drizzle-orm";
import type { createDatabase } from "@/server/db/client";
import { consumedChallenges, sourceSessions, sourceSessionOperations, submissions } from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import { compileSourceFields } from "@/server/sources/source-fields";
import { validateSubmissionLimits } from "@/server/submissions/browser-submission-service";
import { insertPreparedPipelineRuns, preparePipelineRuns } from "@/server/pipelines/pipeline-run-service";
import { defaultSessionSettings, sessionOperationSchema, type PublicSourceSession } from "@/shared/contracts/source-session";

type Database = ReturnType<typeof createDatabase>["db"];
type Session = typeof sourceSessions.$inferSelect;
type WriteDatabase = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Result = { status: number; data?: PublicSourceSession; error?: string };
export const sessionKeyHash = (key: string) => createHash("sha256").update(key).digest("hex");
export function sessionSettings(database: Database, sourceId: string) {
  const source = sourceById(database, sourceId);
  return { ...defaultSessionSettings, ...source?.session, enabled: source?.type === "session" };
}
export function findSourceSession(database: Database, sourceId: string, keyHash: string) {
  return database.select().from(sourceSessions).where(and(eq(sourceSessions.sourceId, sourceId), eq(sourceSessions.keyHash, keyHash))).get();
}
function expire(transaction: WriteDatabase, id: string) {
  transaction.update(sourceSessions).set({ status: "expired", payloadJson: "{}" }).where(eq(sourceSessions.id, id)).run();
  transaction.delete(sourceSessionOperations).where(eq(sourceSessionOperations.sessionId, id)).run();
}
export function expireSourceSessions(database: Database, now = new Date()) {
  return database.transaction(transaction => {
    const expired = transaction.select({ id: sourceSessions.id }).from(sourceSessions).where(and(ne(sourceSessions.status, "expired"), lte(sourceSessions.expiresAt, now))).all();
    for (const session of expired) expire(transaction, session.id);
    return expired.length;
  });
}
function view(session: Session, duplicate = false): Result {
  return { status: 200, data: { status: session.status as "draft" | "completed", payload: JSON.parse(session.payloadJson), revision: session.revision, meta: { currentPage: session.currentPage, sessionUpdateCount: session.updateCount, sessionRequestCount: session.requestCount }, submissionId: session.submissionId, expiresAt: session.expiresAt.toISOString(), ...(duplicate ? { duplicate: true } : {}) } };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function operateSession({ database, source: sourceIdentity, keyHash, body, now = new Date(), creationProof, metadata = {} }: {
  database: Database; source: { id: string }; keyHash: string; body: unknown; now?: Date;
  creationProof?: { challengeId: string; expiresAt: Date };
  metadata?: { clientIp?: string | null; userAgent?: string | null; referer?: string | null };
}): Promise<Result> {
  const source = sourceById(database, sourceIdentity.id);
  const settings = sessionSettings(database, sourceIdentity.id);
  if (!source?.enabled || !settings.enabled) return { status: 404, error: "Sessions are unavailable." };
  let existing = findSourceSession(database, source.id, keyHash);
  if (existing) {
    database.update(sourceSessions).set({ requestCount: sql`${sourceSessions.requestCount} + 1` }).where(eq(sourceSessions.id, existing.id)).run();
    if (existing.status === "expired" || existing.expiresAt <= now) {
      database.transaction(transaction => expire(transaction, existing!.id));
      return { status: 410, error: "Session expired." };
    }
  }
  const parsed = sessionOperationSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: "Invalid session request." };
  const operation = parsed.data;
  if (!existing && operation.operation !== "open") return { status: 404, error: "Session not found." };
  if (!existing) {
    if (source.altchaEnabled && !creationProof) return { status: 403, error: "Verification failed" };
    const inserted = database.transaction(transaction => {
      if (creationProof) {
        const consumed = transaction.insert(consumedChallenges).values({ sourceId: source.id, challengeId: creationProof.challengeId, expiresAt: creationProof.expiresAt, consumedAt: now }).onConflictDoNothing().run();
        if (!consumed.changes) return false;
      }
      transaction.insert(sourceSessions).values({ id: createResourceId(), sourceId: source.id, keyHash, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + settings.inactivityDays * 86400000), requestCount: 1 }).run();
      return true;
    });
    if (!inserted) return { status: 403, error: "Verification failed" };
    existing = findSourceSession(database, source.id, keyHash)!;
    return { ...view(existing), status: 201 };
  }
  if (operation.operation !== "update") {
    if (existing.status === "draft") database.update(sourceSessions).set({ expiresAt: new Date(now.getTime() + settings.inactivityDays * 86400000) }).where(eq(sourceSessions.id, existing.id)).run();
    return view(findSourceSession(database, source.id, keyHash)!);
  }
  const requestHash = sessionKeyHash(canonical({ ...operation, final: operation.final ?? false }));
  // Preparation is read-only. Revision, receipts and finalization are checked again
  // inside the single synchronous SQLite transaction after this asynchronous read.
  const payload = operation.final && source.fieldDefinitionMode && source.fieldDefinitionSource
    ? compileSourceFields(source.fieldDefinitionMode, source.fieldDefinitionSource).parse(operation.payload)
    : operation.payload;
  const prepared = operation.final && payload ? await preparePipelineRuns(database, { sourceId: source.id, payload, createdAt: now }) : [];
  return database.transaction(transaction => {
    const session = transaction.select().from(sourceSessions).where(eq(sourceSessions.id, existing!.id)).get();
    if (!session) return { status: 410, error: "Session unavailable." };
    const currentSource = sourceById(transaction, source.id);
    if (!currentSource?.enabled || !sessionSettings(database, source.id).enabled) return { status: 404, error: "Sessions are unavailable." };
    if (currentSource.updatedAt.getTime() !== source.updatedAt.getTime()) return { status: 409, error: "Source settings changed. Load the session and retry." };
    if (session.status === "expired" || session.expiresAt <= now) return { status: 410, error: "Session expired." };
    const receipt = transaction.select().from(sourceSessionOperations).where(and(eq(sourceSessionOperations.sessionId, session.id), eq(sourceSessionOperations.operationId, operation.operationId))).get();
    if (receipt) return receipt.requestHash === requestHash ? view(session, true) : { status: 409, error: "Operation ID already used for different data." };
    if (session.status === "completed") return operation.final ? view(session, true) : { status: 409, error: "Session already completed." };
    if (session.revision !== operation.revision) return { status: 409, error: "Session changed. Load the latest revision before saving." };
    if (!payload || !validateSubmissionLimits(operation.payload, source) || !validateSubmissionLimits(payload, source)) return { status: 422, error: "Answers do not meet the Source field requirements or limits." };
    if (Object.hasOwn(payload, "altcha") || source.honeypotFieldNames.some(name => Object.hasOwn(payload, name))) return { status: 422, error: "Protection fields belong outside the answers." };
    if (session.updateCount >= 9999 && !operation.final) return { status: 409, error: "Session update limit reached. Submit the final response." };
    const next = { ...session, currentPage: operation.currentPage ?? session.currentPage, payloadJson: JSON.stringify(payload), revision: session.revision + 1, updateCount: session.updateCount + 1, updatedAt: now, expiresAt: new Date(now.getTime() + (operation.final ? settings.completedRetentionDays : settings.inactivityDays) * 86400000), status: operation.final ? "completed" as const : "draft" as const, submissionId: operation.final ? createResourceId() : null };
    if (operation.final) {
      transaction.insert(submissions).values({ id: next.submissionId!, sourceId: source.id, payloadJson: next.payloadJson, createdAt: now, clientIp: metadata.clientIp, userAgent: source.storeUserAgent ? metadata.userAgent : null, referer: source.storeReferer ? metadata.referer : null, sessionUpdateCount: next.updateCount, sessionRequestCount: next.requestCount }).run();
      const meta = { sessionUpdateCount: next.updateCount, sessionRequestCount: next.requestCount };
      for (const run of prepared) run.pipeline.snapshotJson = JSON.stringify({ ...JSON.parse(run.pipeline.snapshotJson), meta });
      insertPreparedPipelineRuns(transaction, next.submissionId!, prepared);
    }
    transaction.update(sourceSessions).set(next).where(eq(sourceSessions.id, session.id)).run();
    transaction.insert(sourceSessionOperations).values({ sessionId: session.id, operationId: operation.operationId, requestHash }).run();
    return view(next);
  });
}
