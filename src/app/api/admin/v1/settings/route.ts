import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminSettingsHandler } from "@/server/admin/settings-handler";

function handler() { return createAdminSettingsHandler({ database: getRuntimeDatabase().db }); }

export async function GET(request: Request) {
  return handler().get(request);
}

export async function PUT(request: Request) {
  return handler().update(request);
}
