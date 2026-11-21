import { redirect } from "next/navigation";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { findSourceBySourceId } from "@/server/sources/source-service";
export default async function SessionsPage({ params }: { params: Promise<{ sourceId: string }> }) {
  const source = await findSourceBySourceId(getRuntimeDatabase().db, (await params).sourceId);
  redirect(`/app/submissions?type=session${source ? `&sourceId=${encodeURIComponent(source.id)}` : ""}`);
}
