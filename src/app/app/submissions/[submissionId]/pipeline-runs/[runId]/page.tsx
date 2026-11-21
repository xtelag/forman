import type { Metadata } from "next";
import { PipelineRunDetailScreen } from "@/components/pipelines/pipeline-run-detail-screen";

export const metadata: Metadata = { title: "Pipeline Run" };

export default async function SubmissionPipelineRunDetailPage({ params }: { params: Promise<{ runId: string; submissionId: string }> }) {
  const { runId, submissionId } = await params;
  return <PipelineRunDetailScreen context={{ kind: "submission", submissionId }} runId={runId} />;
}
