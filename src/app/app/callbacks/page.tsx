import type { Metadata } from "next";
import { CallbacksScreen } from "@/components/pipelines/callbacks-screen";

export const metadata: Metadata = { title: "Waiting Callbacks" };

export default async function CallbacksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <CallbacksScreen initialQuery={{ ...query, olderThanMinutes: typeof query.olderThanMinutes === "string" ? Number(query.olderThanMinutes) : undefined, page: typeof query.page === "string" ? Number(query.page) : undefined, size: typeof query.size === "string" ? Number(query.size) as 10 | 50 | 100 : undefined }} />;
}
