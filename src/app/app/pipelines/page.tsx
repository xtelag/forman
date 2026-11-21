import type { Metadata } from "next";
import { PipelinesScreen } from "@/components/pipelines/pipelines-screen";

export const metadata: Metadata = { title: "Pipelines" };

export default async function PipelinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PipelinesScreen initialQuery={await searchParams} />;
}
