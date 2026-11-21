import type { Metadata } from "next";
import { PageDetailScreen } from "@/components/pages/page-detail-screen";

export const metadata: Metadata = { title: "Built-in Form" };

export default async function AppPageDetail({ params }: { params: Promise<{ pageId: string }> }) {
  return <PageDetailScreen pageId={(await params).pageId} />;
}
