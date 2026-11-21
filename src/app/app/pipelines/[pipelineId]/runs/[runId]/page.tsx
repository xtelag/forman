import type { Metadata } from "next";
import { PipelineRunDetailScreen } from "@/components/pipelines/pipeline-run-detail-screen";

export const metadata: Metadata = { title: "Pipeline Run" };

export default async function PipelineRunDetailPage({ params }: { params: Promise<{ pipelineId: string; runId: string }> }) {
  const { pipelineId, runId } = await params;
  return <PipelineRunDetailScreen context={{ kind: "pipeline", pipelineId }} runId={runId} />;
}
