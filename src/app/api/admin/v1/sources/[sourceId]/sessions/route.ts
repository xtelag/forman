import { getRuntimeDatabase } from "@/server/db/runtime";
import { handleAdminSourceSessions } from "@/server/source-sessions/admin-handler";
export async function GET(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  return handleAdminSourceSessions(getRuntimeDatabase().db, (await params).sourceId, request);
}
export const PATCH = GET;
