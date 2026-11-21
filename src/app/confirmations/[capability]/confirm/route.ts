import { getRuntimeDatabase } from "@/server/db/runtime";
import { confirmEmailConfirmation } from "@/server/pipelines/email-confirmation-session";

export async function POST(_request: Request, { params }: { params: Promise<{ capability: string }> }) {
  const confirmation = confirmEmailConfirmation(getRuntimeDatabase().db, (await params).capability);
  if (!confirmation) {
    return Response.json({ error: "invalid_confirmation" }, { status: 410 });
  }
  return Response.json(confirmation);
}
