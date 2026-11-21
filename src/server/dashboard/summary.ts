import { count, eq, gte } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { pipelineActionRuns, sources, submissions } from "@/server/db/schema";
import { listSubmissions } from "@/server/submissions/query-service";
import { waitingCallbackCondition } from "@/server/pipelines/callback-query-service";
import { failedActionCondition } from "@/server/pipelines/pipeline-run-query-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function beforeDays(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}

export async function getDashboardSummary(database: FormanDatabase, now = new Date()) {
  const [activeSources, totalSubmissions, last24Hours, last7Days, last30Days, recentSubmissions, failedActions, waitingCallbacks] = await Promise.all([
    database.select({ value: count() }).from(sources).where(eq(sources.enabled, true)).get(),
    database.select({ value: count() }).from(submissions).get(),
    database.select({ value: count() }).from(submissions).where(gte(submissions.createdAt, beforeDays(now, 1))).get(),
    database.select({ value: count() }).from(submissions).where(gte(submissions.createdAt, beforeDays(now, 7))).get(),
    database.select({ value: count() }).from(submissions).where(gte(submissions.createdAt, beforeDays(now, 30))).get(),
    listSubmissions(database, { limit: 10 }),
    database.select({ value: count() }).from(pipelineActionRuns).where(failedActionCondition(now, true)).get(),
    database.select({ value: count() }).from(pipelineActionRuns).where(waitingCallbackCondition(database)).get(),
  ]);

  return {
    activeSourceCount: activeSources?.value ?? 0,
    failedActionCount: failedActions?.value ?? 0,
    waitingCallbackCount: waitingCallbacks?.value ?? 0,
    recentSubmissions: recentSubmissions.items.map((submission) => ({
      ...submission,
      type: submission.sessionUpdateCount === null ? "one-shot" as const : "session" as const,
      state: "completed" as const,
    })),
    totalSubmissionCount: totalSubmissions?.value ?? 0,
    submissionsLast24Hours: last24Hours?.value ?? 0,
    submissionsLast7Days: last7Days?.value ?? 0,
    submissionsLast30Days: last30Days?.value ?? 0,
  };
}
