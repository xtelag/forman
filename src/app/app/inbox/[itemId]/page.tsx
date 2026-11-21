import type { Metadata } from "next";
import { InboxItemScreen } from "@/components/inbox/inbox-item-screen";

export const metadata: Metadata = { title: "Inbox item" };

export default async function InboxItemPage({ params, searchParams }: { params: Promise<{ itemId: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  return <InboxItemScreen itemId={(await params).itemId} returnTo={(await searchParams).returnTo} />;
}
