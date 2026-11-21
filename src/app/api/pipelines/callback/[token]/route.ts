import { getRuntimeDatabase } from "@/server/db/runtime";
import { acceptPipelineCallback } from "@/server/pipelines/pipeline-callback-handler";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return acceptPipelineCallback(getRuntimeDatabase().db, (await params).token, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return acceptPipelineCallback(getRuntimeDatabase().db, (await params).token, request);
}
