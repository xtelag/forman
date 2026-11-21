import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { parseDateInput } from "@/shared/format/date";
import type { AdminSubmission, AdminSubmissionDetail, AdminSubmissionsResponse } from "@/shared/contracts/admin";

import { getSubmissionReview, listSubmissionReview } from "./review-service";
import { deleteMatchingSubmissionBatch, deleteSubmission, deleteSubmissions } from "./query-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type AdminSubmissionsHandlerDependencies = {
  database: FormanDatabase;
};

function positiveInteger(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseSnapshotTimestamp(value: unknown) {
  if (typeof value !== "string") return undefined;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== value ? undefined : timestamp;
}

type SubmissionForList = Omit<NonNullable<Awaited<ReturnType<typeof getSubmissionReview>>>, "pipelineRuns">;

function toAdminSubmission(submission: SubmissionForList): AdminSubmission {
  return {
    type: submission.type,
    state: submission.state,
    createdAt: submission.createdAt.toISOString(),
    sourceId: submission.sourceId,
    sourcePublicId: submission.sourcePublicId,
    sourceName: submission.sourceName,
    id: submission.id,
    payload: submission.payload,
    referer: submission.referer,
    tags: submission.tags,
    userAgent: submission.userAgent,
    ...(typeof submission.sessionUpdateCount === "number" && typeof submission.sessionRequestCount === "number" ? { meta: { sessionUpdateCount: submission.sessionUpdateCount, sessionRequestCount: submission.sessionRequestCount } } : {}),
  };
}

function toAdminSubmissionDetail(submission: NonNullable<Awaited<ReturnType<typeof getSubmissionReview>>>): AdminSubmissionDetail {
  return {
    ...toAdminSubmission(submission),
    pipelineRuns: submission.pipelineRuns.map((run) => ({
      ...run,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    })),
  };
}

export function createAdminSubmissionsHandler({ database }: AdminSubmissionsHandlerDependencies) {
  return {
    async get(request: Request, submissionId: string) {
      const session = await getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const submission = await getSubmissionReview(database, submissionId);
      if (!submission) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json(toAdminSubmissionDetail(submission));
    },
    async list(request: Request) {
      const session = await getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const parameters = new URL(request.url).searchParams;
      const snapshotBefore = parameters.has("snapshotBefore") ? parseSnapshotTimestamp(parameters.get("snapshotBefore")) : new Date();
      if (!snapshotBefore || snapshotBefore.getTime() > Date.now()) return Response.json({ error: "Invalid snapshot" }, { status: 400 });
      const results = await listSubmissionReview(database, {
        snapshotBefore,
        type: parameters.get("type") || undefined,
        state: parameters.get("state") || undefined,
        sourceId: parameters.get("sourceId") || undefined,
        from: parseDateInput(parameters.get("from")),
        limit: positiveInteger(parameters.get("limit")),
        offset: positiveInteger(parameters.get("offset")),
        search: parameters.get("search") || undefined,
        tagIds: parameters.getAll("tagId").filter(Boolean),
        to: parseDateInput(parameters.get("to"), true),
      });
      const response: AdminSubmissionsResponse = { snapshotBefore: snapshotBefore.toISOString(), items: results.items.map(toAdminSubmission), total: results.total, deletableTotal: results.deletableTotal };
      return Response.json(response);
    },
    async remove(request: Request) {
      const session = await getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const body: unknown = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || !("type" in body)) return Response.json({ error: "Invalid selection" }, { status: 400 });
      const selection = body as Record<string, unknown>;
      if (selection.type === "filter") {
        const filter = selection.filter;
        if (!filter || typeof filter !== "object" || !Array.isArray(selection.excludedIds)) return Response.json({ error: "Invalid selection" }, { status: 400 });
        const values = filter as Record<string, unknown>;
        const snapshotBefore = parseSnapshotTimestamp(selection.snapshotBefore);
        if (!snapshotBefore || ["sourceId", "from", "search", "to", "type", "state"].some((key) => values[key] !== undefined && typeof values[key] !== "string") || (values.tagIds !== undefined && (!Array.isArray(values.tagIds) || values.tagIds.some((tagId) => typeof tagId !== "string" || tagId.length === 0))) || selection.excludedIds.some((id) => typeof id !== "string" || id.length === 0)) {
          return Response.json({ error: "Invalid selection" }, { status: 400 });
        }

        if ((values.type !== undefined && !["one-shot", "session"].includes(String(values.type))) ||
            (values.state !== undefined && !["completed", "draft", "expired"].includes(String(values.state))) ||
            (values.from !== undefined && !parseDateInput(values.from as string)) ||
            (values.to !== undefined && !parseDateInput(values.to as string, true))) {
          return Response.json({ error: "Invalid selection filters" }, { status: 400 });
        }
        return Response.json(await deleteMatchingSubmissionBatch(database, {
          type: values.type as string | undefined,
          state: values.state as string | undefined,
          excludedIds: selection.excludedIds as string[],
          sourceId: values.sourceId as string | undefined,
          from: parseDateInput(values.from as string | undefined),
          search: values.search as string | undefined,
          snapshotBefore,
          tagIds: values.tagIds as string[] | undefined,
          to: parseDateInput(values.to as string | undefined, true),
        }));
      }
      if (selection.type !== "ids" || !Array.isArray(selection.ids)) {
        return Response.json({ error: "Invalid selection" }, { status: 400 });
      }
      const ids = selection.ids;
      if (ids.length === 0 || ids.some((id) => typeof id !== "string" || id.length === 0)) {
        return Response.json({ error: "Invalid selection" }, { status: 400 });
      }

      return Response.json({ deleted: await deleteSubmissions(database, ids as string[]) });
    },
    async delete(request: Request, submissionId: string) {
      const session = await getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (!(await deleteSubmission(database, submissionId))) return Response.json({ error: "Not found" }, { status: 404 });
      return new Response(null, { status: 204 });
    },
  };
}
