import { createAdminApplicationHandler } from "@/server/admin/application-handler";
import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";

export async function GET(request: Request) {
  return createAdminApplicationHandler({
    baseUrl: loadEnvironment(process.env).baseOrigin,
    database: getRuntimeDatabase().db,
  }).get(request);
}
