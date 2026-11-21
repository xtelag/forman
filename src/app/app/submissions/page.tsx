import type { Metadata } from "next";
import { SubmissionsScreen, type SubmissionScreenQuery } from "@/components/submissions/submissions-screen";

export const metadata: Metadata = { title: "Submissions" };

type SubmissionsPageProperties = {
  searchParams: Promise<SubmissionScreenQuery>;
};

export default async function SubmissionsPage({ searchParams }: SubmissionsPageProperties) {
  return <SubmissionsScreen initialQuery={await searchParams} />;
}
