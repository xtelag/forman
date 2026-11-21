import type { Metadata } from "next";
import { PipelineRunDetailScreen } from "@/components/pipelines/pipeline-run-detail-screen";

export const metadata: Metadata = { title: "Pipeline Run" };

export default async function GlobalPipelineRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  return <PipelineRunDetailScreen context={{ kind: "global" }} runId={(await params).runId} />;
}
