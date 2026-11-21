import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminSettingsHandler } from "@/server/admin/settings-handler";

function handler() { return createAdminSettingsHandler({ database: getRuntimeDatabase().db }); }

export async function PUT(request: Request) { return handler().updateSmtp(request); }
export async function DELETE(request: Request) { return handler().removeSmtpPassword(request); }
