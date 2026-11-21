import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminInboxHandler } from "@/server/inbox/admin-inbox-handler";

export async function GET(request: Request) {
  return createAdminInboxHandler({ database: getRuntimeDatabase().db }).list(request);
}

export async function POST(request: Request) {
  return createAdminInboxHandler({ database: getRuntimeDatabase().db }).bulk(request);
}
