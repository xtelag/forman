import { createPasswordChangeHandler } from "@/server/auth/password-change-handler";
import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";

export async function POST(request: Request) {
  const environment = loadEnvironment(process.env);
  return createPasswordChangeHandler({
    database: getRuntimeDatabase().db,
    secure: environment.baseOrigin.protocol === "https:",
  })(request);
}
