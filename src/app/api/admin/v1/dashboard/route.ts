import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminDashboardHandler } from "@/server/admin/dashboard-handler";

export async function GET(request: Request) {
  return createAdminDashboardHandler({ database: getRuntimeDatabase().db }).get(request);
}
