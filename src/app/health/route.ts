import { getRuntimeDatabase } from "@/server/db/runtime";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    // Reading application schema also verifies that migrations completed.
    const settings = getRuntimeDatabase().client
      .prepare("SELECT id FROM global_setting WHERE id = ?")
      .get("global");
    if (!settings) throw new Error("Database not ready");
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
