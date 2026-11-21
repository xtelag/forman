import type { Metadata } from "next";
import { SourceDetailScreen } from "@/components/sources/source-detail-screen";

export const metadata: Metadata = { title: "Source" };

type SourcePageProperties = {
  params: Promise<{ sourceId: string }>;
};

export default async function SourcePage({ params }: SourcePageProperties) {
  const { sourceId } = await params;
  return <SourceDetailScreen sourceId={sourceId} />;
}
