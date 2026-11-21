import { createAdminSourcesHandler } from "@/server/sources/admin-source-handler";
import { getRuntimeDatabase } from "@/server/db/runtime";

export async function GET(request: Request) {
  return createAdminSourcesHandler({ database: getRuntimeDatabase().db }).list(request);
}

export async function POST(request: Request) {
  return createAdminSourcesHandler({ database: getRuntimeDatabase().db }).create(request);
}
