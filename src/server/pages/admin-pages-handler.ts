import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import {
  listTagsForSource,
  listTagsForSources,
  type Tag,
} from "@/server/tags/tag-service";
import type {
  AdminPageDetail,
  AdminPageSummary,
  AdminPagesResponse,
} from "@/shared/contracts/admin";

import {
  createPage,
  deletePage,
  findPageByPublicId,
  listPages,
  updatePage,
  type PageCreateResult,
  type PageRecord,
} from "./page-service";
import { createPageViewModel } from "./page-view-model";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function publicUrl(baseUrl: URL, pageId: string) {
  return new URL(`/pages/${encodeURIComponent(pageId)}`, baseUrl).toString();
}

function toSummary(
  baseUrl: URL,
  page: PageRecord,
  tags: Tag[],
): AdminPageSummary {
  return {
    createdAt: page.createdAt.toISOString(),
    enabled: page.enabled,
    sourceEnabled: page.sourceEnabled,
    sourceId: page.sourceId,
    sourceName: page.sourceName,
    sourcePublicId: page.sourcePublicId,
    id: page.id,
    name: page.name,
    pageId: page.pageId,
    publicUrl: publicUrl(baseUrl, page.pageId),
    tags,
    updatedAt: page.updatedAt.toISOString(),
  };
}

function toDetail(baseUrl: URL, page: PageRecord, tags: Tag[]): AdminPageDetail {
  let fields: AdminPageDetail["fields"] = [];
  try { if (page.fieldDefinitionMode && page.fieldDefinitionSource) fields = createPageViewModel({ mode: page.fieldDefinitionMode, source: page.fieldDefinitionSource, presentation: page.presentation }).fields; } catch { /* Invalid Source fields are shown by the editor. */ }
  return { ...toSummary(baseUrl, page, tags), presentation: page.presentation, fields, sessionsEnabled: page.sessionsEnabled ?? false };
}

function resultError(
  result:
    | Exclude<PageCreateResult, PageRecord>
    | "missing",
) {
  if (result === "missing")
    return Response.json({ error: "Page not found" }, { status: 404 });
  if (result === "missing-source")
    return Response.json({ error: "Source not found" }, { status: 400 });
  if (result === "source-fields-required")
    return Response.json(
      {
        error:
          "The Source needs a valid Source fields definition before a Built-in Form can be created.",
      },
      { status: 400 },
    );
  return Response.json(
    { error: "Invalid Page configuration" },
    { status: 400 },
  );
}

export function createAdminPagesHandler({
  baseUrl,
  database,
}: {
  baseUrl: URL;
  database: FormanDatabase;
}) {
  async function authorized(request: Request) {
    return Boolean(
      await getAdministratorSessionFromCookie(
        database,
        request.headers.get("cookie"),
      ),
    );
  }

  return {
    async list(request: Request) {
      if (!(await authorized(request))) return unauthorized();
      const pages = await listPages(database);
      const tagsBySource = await listTagsForSources(
        database,
        pages.map((page) => page.sourceId),
      );
      const response: AdminPagesResponse = {
        items: pages.map((page) =>
          toSummary(baseUrl, page, tagsBySource.get(page.sourceId) ?? []),
        ),
      };
      return Response.json(response);
    },
    async create(request: Request) {
      if (!(await authorized(request))) return unauthorized();
      const result = await createPage(
        database,
        await request.json().catch(() => undefined),
      );
      if (typeof result === "string") return resultError(result);
      return Response.json(
        toDetail(
          baseUrl,
          result,
          await listTagsForSource(database, result.sourceId),
        ),
        { status: 201 },
      );
    },
    async get(request: Request, pageId: string) {
      if (!(await authorized(request))) return unauthorized();
      const page = await findPageByPublicId(database, pageId);
      return page
        ? Response.json(
            toDetail(
              baseUrl,
              page,
              await listTagsForSource(database, page.sourceId),
            ),
          )
        : Response.json({ error: "Page not found" }, { status: 404 });
    },
    async update(request: Request, pageId: string) {
      if (!(await authorized(request))) return unauthorized();
      const result = await updatePage(
        database,
        pageId,
        await request.json().catch(() => undefined),
      );
      if (typeof result === "string")
        return resultError(result);
      return Response.json(
        toDetail(
          baseUrl,
          result,
          await listTagsForSource(database, result.sourceId),
        ),
      );
    },
    async delete(request: Request, pageId: string) {
      if (!(await authorized(request))) return unauthorized();
      return (await deletePage(database, pageId))
        ? new Response(null, { status: 204 })
        : Response.json({ error: "Page not found" }, { status: 404 });
    },
  };
}
