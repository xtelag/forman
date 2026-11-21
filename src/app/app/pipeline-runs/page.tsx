import type { Metadata } from "next";
import { GlobalPipelineRunsScreen } from "@/components/pipelines/global-pipeline-runs-screen";

export const metadata: Metadata = { title: "Pipeline Runs" };

export default async function PipelineRunsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GlobalPipelineRunsScreen initialQuery={await searchParams} />;
}
