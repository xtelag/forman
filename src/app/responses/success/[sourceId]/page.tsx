import type { Metadata } from "next";
import { CircleCheckBig } from "lucide-react";

import { PublicStatePage } from "@/components/public/public-state-page";
import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { findPageByPublicId } from "@/server/pages/page-service";
import { readSuccessReturnTarget } from "@/server/submissions/success-return-target";

export const metadata: Metadata = { title: { absolute: "Submission received" } };

export default async function SuccessResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ return?: string | string[] }>;
}) {
  const [{ sourceId }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.return === "string" ? query.return : null;
  const environment = loadEnvironment(process.env);
  const pageId = token?.startsWith("page:")
    ? token.slice("page:".length)
    : null;
  const page = pageId
    ? await findPageByPublicId(getRuntimeDatabase().db, pageId)
    : null;
  const returnTarget = pageId
    ? page?.sourcePublicId === sourceId &&
      page.enabled &&
      page.sourceEnabled
      ? new URL(
          `/pages/${encodeURIComponent(page.pageId)}`,
          environment.baseOrigin,
        ).toString()
      : null
    : readSuccessReturnTarget(token, {
        sourceId,
        now: new Date(),
        sessionSecret: environment.sessionSecret,
      });

  return (
    <PublicStatePage
      centered
      action={
        returnTarget
          ? {
              href: returnTarget,
              label: "Return to page",
              outline: true,
            }
          : undefined
      }
      description="The submission has been received."
      icon={<CircleCheckBig className="size-12 text-emerald-600" strokeWidth={1.8} />}
      title="Submission received"
    />
  );
}
