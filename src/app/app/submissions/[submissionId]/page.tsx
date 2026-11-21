import type { Metadata } from "next";
import { SubmissionDetailScreen } from "@/components/submissions/submission-detail-screen";

export const metadata: Metadata = { title: "Submission" };

type SubmissionPageProperties = { params: Promise<{ submissionId: string }>; searchParams: Promise<{ returnTo?: string }> };

export default async function SubmissionPage({ params, searchParams }: SubmissionPageProperties) {
  const { submissionId } = await params;
  const { returnTo } = await searchParams;
  return <SubmissionDetailScreen returnTo={returnTo} submissionId={submissionId} />;
}
