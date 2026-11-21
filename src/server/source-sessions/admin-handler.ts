import { parsePageSize as normalizePageSize } from "@/shared/pagination";
import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { and, desc, eq, sql } from "drizzle-orm";
import type { createDatabase } from "@/server/db/client";
import { sourceSessions } from "@/server/db/schema";
import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import { findSourceBySourceId } from "@/server/sources/source-service";
import { readBoundedRequestText } from "@/server/http/bounded-request-body";
import { sessionSettingsSchema, type AdminSourceSession } from "@/shared/contracts/source-session";
import { expireSourceSessions, sessionSettings } from "./session-service";
type Database = ReturnType<typeof createDatabase>["db"];
export async function handleAdminSourceSessions(database: Database, sourceId: string, request: Request) {
  const headers = { "cache-control": "no-store" };
  const respond = (value: unknown, status = 200) => Response.json(value, { headers, status });
  if (!await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))) return respond({ error: "Unauthorized" }, 401);
  const source = await findSourceBySourceId(database, sourceId);
  if (!source || source.type !== "session") return respond({ error: "Source not found." }, 404);
  if (request.method === "PATCH") {
    try {
      const settings = sessionSettingsSchema.omit({ enabled: true }).parse(JSON.parse(await readBoundedRequestText(request, 4096)));
      if (!mutateSourceConfiguration(database, source.id, () => ({ session: settings }))) return respond({ error: "Source not found." }, 404);
      return respond({ ...settings, enabled: true });
    } catch { return respond({ error: "Invalid session settings." }, 400); }
  }
  if (request.method !== "GET") return respond({ error: "Method not allowed." }, 405);
  expireSourceSessions(database);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const item = database.select({ payloadJson: sourceSessions.payloadJson, status: sourceSessions.status }).from(sourceSessions).where(and(eq(sourceSessions.id, id), eq(sourceSessions.sourceId, source.id))).get();
    return item ? respond({ payload: JSON.parse(item.payloadJson), status: item.status }) : respond({ error: "Session not found." }, 404);
  }
  const pageInput = Number(url.searchParams.get("page") ?? 1);
  const page = Number.isSafeInteger(pageInput) && pageInput > 0 && pageInput <= 1000000 ? pageInput : 1;
  const sizeInput = Number(url.searchParams.get("size"));
  const size = normalizePageSize(sizeInput);
  const status = url.searchParams.get("status");
  const filter = and(eq(sourceSessions.sourceId, source.id), status === "draft" || status === "completed" || status === "expired" ? eq(sourceSessions.status, status) : undefined);
  const rows = database.select({ currentPage: sourceSessions.currentPage, id: sourceSessions.id, status: sourceSessions.status, revision: sourceSessions.revision, updateCount: sourceSessions.updateCount, requestCount: sourceSessions.requestCount, createdAt: sourceSessions.createdAt, updatedAt: sourceSessions.updatedAt, expiresAt: sourceSessions.expiresAt, submissionId: sourceSessions.submissionId }).from(sourceSessions).where(filter).orderBy(desc(sourceSessions.createdAt), desc(sourceSessions.id)).limit(size).offset((page - 1) * size).all();
  const items: AdminSourceSession[] = rows.map(row => ({ id: row.id, status: row.status, revision: row.revision, meta: { currentPage: row.currentPage, sessionUpdateCount: row.updateCount, sessionRequestCount: row.requestCount }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), submissionId: row.submissionId }));
  return respond({ settings: sessionSettings(database, source.id), items, total: database.select({ value: sql<number>`count(*)` }).from(sourceSessions).where(filter).get()!.value, page, size });
}
