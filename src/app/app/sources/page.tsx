import type { Metadata } from "next";
import { SourcesScreen } from "@/components/sources/sources-screen";

export const metadata: Metadata = { title: "Data Sources" };

export default async function AppSourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SourcesScreen initialQuery={await searchParams} />;
}
