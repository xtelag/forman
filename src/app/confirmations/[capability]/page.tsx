import type { Metadata } from "next";
import { EmailConfirmationPage } from "@/components/public/email-confirmation-page";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { getPublicEmailConfirmation } from "@/server/pipelines/email-confirmation-session";

export const metadata: Metadata = { title: { absolute: "Email confirmation" } };

export default async function EmailConfirmationRoute({ params }: { params: Promise<{ capability: string }> }) {
  const { capability } = await params;
  const confirmation = getPublicEmailConfirmation(getRuntimeDatabase().db, capability);
  if (!confirmation) {
    return <EmailConfirmationPage capability={capability} confirmationCtaLabel="Confirm" confirmationText="" invalid />;
  }
  return <EmailConfirmationPage capability={capability} {...confirmation} />;
}
