import { getGlobalSettings } from "@/server/config/global-settings";
import { getRuntimeDatabase } from "@/server/db/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getGlobalSettings(getRuntimeDatabase().db);
  return new Response(settings.robotsTxt, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
