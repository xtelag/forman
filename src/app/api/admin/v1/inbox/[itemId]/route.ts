import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminInboxHandler } from "@/server/inbox/admin-inbox-handler";

export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return createAdminInboxHandler({ database: getRuntimeDatabase().db }).get(request, (await params).itemId);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return createAdminInboxHandler({ database: getRuntimeDatabase().db }).update(request, (await params).itemId);
}
