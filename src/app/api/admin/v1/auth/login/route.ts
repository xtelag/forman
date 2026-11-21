import { createLoginHandler } from "@/server/auth/login-handler";
import { getRuntimeLoginAttemptLimiter } from "@/server/auth/runtime-login-limiter";
import { loadEnvironment } from "@/server/config/environment";
import { getGlobalSettings } from "@/server/config/global-settings";
import { getRuntimeDatabase } from "@/server/db/runtime";

export async function POST(request: Request) {
  const database = getRuntimeDatabase().db;
  const settings = await getGlobalSettings(database);
  return createLoginHandler({
    database,
    environment: loadEnvironment(process.env),
    limiter: getRuntimeLoginAttemptLimiter({
      capacity: settings.rateLimiterCapacity,
      maxAttempts: settings.loginFailureLimit,
      windowMs: settings.loginFailureWindowSeconds * 1_000,
    }),
  })(request);
}
