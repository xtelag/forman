import { parsePageSize as normalizePageSize } from "@/shared/pagination";
import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { listWaitingCallbacks, type WaitingCallbackFilters } from "./callback-query-service";

type Database = ReturnType<typeof createDatabase>["db"];

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function filters(request: Request): WaitingCallbackFilters {
  const query = new URL(request.url).searchParams;
  const size = positiveInteger(query.get("size"), 10);
  return {
    olderThanMinutes: positiveInteger(query.get("olderThanMinutes"), 0) || undefined,
    from: query.get("from") || undefined,
    page: positiveInteger(query.get("page"), 1),
    pipelineId: query.get("pipelineId") || undefined,
    size: normalizePageSize(size),
    search: query.get("search")?.trim() || undefined,
    sourceId: query.get("sourceId") || undefined,
    tagIds: query.getAll("tagId").filter(Boolean),
    to: query.get("to") || undefined,
  };
}

export function createAdminCallbacksHandler({ database }: { database: Database }) {
  return {
    async list(request: Request) {
      if (!await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const result = await listWaitingCallbacks(database, filters(request));
      return Response.json({
        items: result.items.map((callback) => ({
          ...callback,
          callbackExpiresAt: callback.callbackExpiresAt.toISOString(),
          waitingSince: callback.waitingSince.toISOString(),
        })),
        total: result.total,
      });
    },
  };
}
