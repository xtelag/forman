import type { Metadata } from "next";
import { InboxScreen } from "@/components/inbox/inbox-screen";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <InboxScreen initialQuery={await searchParams} />;
}
