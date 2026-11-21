import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminSettingsHandler } from "@/server/admin/settings-handler";

export async function POST(request: Request) {
  return createAdminSettingsHandler({ database: getRuntimeDatabase().db }).testSmtp(request);
}
