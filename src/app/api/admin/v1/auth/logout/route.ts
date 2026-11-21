import { createLogoutHandler } from "@/server/auth/logout-handler";
import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";

export async function POST(request: Request) {
  const environment = loadEnvironment(process.env);
  return createLogoutHandler({
    database: getRuntimeDatabase().db,
    secure: environment.baseOrigin.protocol === "https:",
  })(request);
}
