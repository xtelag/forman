import type { Metadata } from "next";
import { PipelineDetailScreen } from "@/components/pipelines/pipeline-detail-screen";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ pipelineId: string }>;
}) {
  const { pipelineId } = await params;
  return <PipelineDetailScreen pipelineId={pipelineId} />;
}
