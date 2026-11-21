import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminServerTokenHandler } from "@/server/sources/admin-server-token-handler";

export async function GET(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return createAdminServerTokenHandler({ database: getRuntimeDatabase().db }).get(request, sourceId);
}

export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return createAdminServerTokenHandler({ database: getRuntimeDatabase().db }).issue(request, sourceId);
}
