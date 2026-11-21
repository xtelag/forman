import type { createDatabase } from "@/server/db/client";
import { getGlobalSettings } from "@/server/config/global-settings";

export async function administratorSessionPolicy(
  database: ReturnType<typeof createDatabase>["db"],
) {
  const settings = getGlobalSettings(database);
  return {
    idleMs: settings.adminSessionIdleDays * 86400_000,
    absoluteMs: settings.adminSessionAbsoluteDays * 86400_000,
  };
}
