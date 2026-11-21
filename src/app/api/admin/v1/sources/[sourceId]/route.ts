import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminSourceDetailHandler } from "@/server/sources/admin-source-detail-handler";
import { createAdminSourceLifecycleHandler } from "@/server/sources/admin-source-lifecycle-handler";

export async function GET(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return createAdminSourceDetailHandler({
    baseUrl: loadEnvironment(process.env).baseOrigin,
    database: getRuntimeDatabase().db,
  }).get(request, sourceId);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return createAdminSourceLifecycleHandler({ database: getRuntimeDatabase().db }).update(request, sourceId);
}

export async function PUT(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return createAdminSourceLifecycleHandler({ database: getRuntimeDatabase().db }).configure(request, sourceId);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return createAdminSourceLifecycleHandler({ database: getRuntimeDatabase().db }).delete(request, sourceId);
}
