import type { Metadata } from "next";
import { PagesScreen } from "@/components/pages/pages-screen";

export const metadata: Metadata = { title: "Built-in Forms" };

export default async function AppPagesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PagesScreen initialQuery={await searchParams} />;
}
