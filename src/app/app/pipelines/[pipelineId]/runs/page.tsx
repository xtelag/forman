import type { Metadata } from "next";
import { PipelineRunsScreen } from "@/components/pipelines/pipeline-runs-screen";

export const metadata: Metadata = { title: "Pipeline Runs" };

export default async function PipelineRunsPage({ params, searchParams }: { params: Promise<{ pipelineId: string }>; searchParams: Promise<{ search?: string; page?: string; size?: string }> }) {
  const { pipelineId } = await params;
  return <PipelineRunsScreen initialQuery={await searchParams} pipelineId={pipelineId} />;
}
