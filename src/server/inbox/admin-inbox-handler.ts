import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { configuredInboxItems } from "@/server/db/schema";
import { serializeInboxCsv } from "@/server/inbox/export-service";
import { getInboxItem } from "@/server/inbox/inbox-service";
import {
  selectInboxIds,
  listFilteredInboxItems,
  listInboxPage,
  parseInboxFilters,
} from "@/server/inbox/inbox-query";

type Database = ReturnType<typeof createDatabase>["db"];

export function createAdminInboxHandler({ database }: { database: Database }) {
  return {
    async get(request: Request, itemId: string) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))))
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const item = await getInboxItem(database, itemId);
      return item ? Response.json(item) : Response.json({ error: "Inbox item not found" }, { status: 404 });
    },
    async list(request: Request) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))))
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const url = new URL(request.url);
      if (url.searchParams.get("selection") === "all") return Response.json({ids: selectInboxIds(database, parseInboxFilters(url.searchParams))});
      const requestedPage = Number(url.searchParams.get("page"));
      const page = Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
      const requestedLimit = Number(url.searchParams.get("limit"));
      const limit = Number.isSafeInteger(requestedLimit) ? Math.min(100, Math.max(10, requestedLimit)) : 10;
      return Response.json(await listInboxPage(
        database, parseInboxFilters(url.searchParams), limit, Math.min(Number.MAX_SAFE_INTEGER, (page - 1) * limit),
      ));
    },
    async export(request: Request) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))))
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const parameters = new URL(request.url).searchParams;
      const items = await listFilteredInboxItems(
        database,
        parseInboxFilters(parameters),
      );
      return new Response(serializeInboxCsv(items), {
        headers: {
          "content-disposition": 'attachment; filename="forman-inbox.csv"',
          "content-type": "text/csv; charset=utf-8",
        },
      });
    },
    async update(request: Request, itemId: string) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))))
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const body = await request.json().catch(() => null) as { action?: string } | null;
      const item = await database.select().from(configuredInboxItems).where(eq(configuredInboxItems.id, itemId)).get();
      if (!item) return Response.json({ error: "Inbox item not found" }, { status: 404 });
      if (body?.action === "delete") {
        const result = await database.delete(configuredInboxItems).where(and(eq(configuredInboxItems.id, itemId), isNotNull(configuredInboxItems.trashedAt))).run();
        return result.changes ? new Response(null, {status:204}) : Response.json({error:"Only items in Trash can be permanently deleted"}, {status:409});
      }
      const now = new Date();
      if (body?.action === "trash") await database.update(configuredInboxItems).set({ preTrashState: item.state, trashedAt: now, updatedAt: now }).where(eq(configuredInboxItems.id, itemId));
      else if (body?.action === "restore") await database.update(configuredInboxItems).set({ preTrashState: null, trashedAt: null, updatedAt: now }).where(eq(configuredInboxItems.id, itemId));
      else if (body?.action === "read") await database.update(configuredInboxItems).set({ readAt: now, state: "read", updatedAt: now }).where(eq(configuredInboxItems.id, itemId));
      else if (body?.action === "unread") await database.update(configuredInboxItems).set({ readAt: null, state: "unread", updatedAt: now }).where(eq(configuredInboxItems.id, itemId));
      else if (body?.action === "archive") await database.update(configuredInboxItems).set({ archivedAt: now, state: "archived", updatedAt: now }).where(eq(configuredInboxItems.id, itemId));
      else if (body?.action === "unarchive") await database.update(configuredInboxItems).set({ archivedAt: null, state: "read", updatedAt: now }).where(eq(configuredInboxItems.id, itemId));
      else return Response.json({ error: "Invalid Inbox action" }, { status: 400 });
      return new Response(null, { status: 204 });
    },
    async bulk(request: Request) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie"))))
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const body = await request.json().catch(() => null) as { action?: string; ids?: unknown } | null;
      if (!body || !Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string"))
        return Response.json({ error: "Invalid Inbox selection" }, { status: 400 });
      if (body.ids.length > 100) return Response.json({error: "Select at most 100 items per batch"}, {status: 400});
      if (body.action === "delete") {
        if (!body.ids.length) return Response.json({changed:0});
        const result = await database.delete(configuredInboxItems).where(and(inArray(configuredInboxItems.id, body.ids), isNotNull(configuredInboxItems.trashedAt))).run();
        return Response.json({changed:result.changes});
      }
      if (body.action === "empty-trash") {
        const result = await database.delete(configuredInboxItems).where(isNotNull(configuredInboxItems.trashedAt)).run();
        return Response.json({ changed: result.changes });
      }
      if (!(["trash", "restore", "read", "unread", "archive", "unarchive"] as const).includes(body.action as "trash" | "restore" | "read" | "unread" | "archive" | "unarchive"))
        return Response.json({ error: "Invalid Inbox action" }, { status: 400 });
      if (body.ids.length === 0) return Response.json({ changed: 0 });
      const now = new Date();
      const values = body.action === "trash" ? { preTrashState: configuredInboxItems.state, trashedAt: now, updatedAt: now } : body.action === "restore" ? { trashedAt: null, preTrashState: null, updatedAt: now } : body.action === "read" ? { readAt: now, state: "read" as const, updatedAt: now } : body.action === "unread" ? { readAt: null, state: "unread" as const, updatedAt: now } : body.action === "unarchive" ? { archivedAt: null, state: "read" as const, updatedAt: now } : { archivedAt: now, state: "archived" as const, updatedAt: now };
      const result = await database.update(configuredInboxItems).set(values).where(inArray(configuredInboxItems.id, body.ids)).run();
      return Response.json({ changed: result.changes });
    },
  };
}
