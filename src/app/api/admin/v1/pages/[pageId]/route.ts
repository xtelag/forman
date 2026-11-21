import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPagesHandler } from "@/server/pages/admin-pages-handler";

function handler() {
  const environment = loadEnvironment(process.env);
  return createAdminPagesHandler({
    baseUrl: environment.baseOrigin,
    database: getRuntimeDatabase().db,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  return handler().get(request, (await params).pageId);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  return handler().update(request, (await params).pageId);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  return handler().delete(request, (await params).pageId);
}
