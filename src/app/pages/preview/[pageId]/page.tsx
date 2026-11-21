import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { SourcePage } from "@/components/public/source-page";
import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { readPagePreviewToken } from "@/server/pages/page-preview-token";
import { isBaseOrigin, requestOrigin } from "@/server/http/request-origin";
import { createPublicPageHandler } from "@/server/pages/public-page-handler";

// Unpublished drafts can be previewed; keep their titles out of unauthenticated metadata.
export const metadata: Metadata = { title: { absolute: "Form preview" } };

export default async function PublicPagePreviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const [environment, { pageId }, previewParameters] = await Promise.all([
    loadEnvironment(process.env),
    params,
    searchParams,
  ]);
  if (!isBaseOrigin(requestOrigin(await headers(), {
    protocol: environment.baseOrigin.protocol,
    trustProxy: environment.trustProxy,
  }) ?? "", environment.baseOrigin)) notFound();
  const preview = previewParameters.preview;
  if (typeof preview !== "string") notFound();
  if (!readPagePreviewToken(preview, {
    now: new Date(),
    pageId,
    sessionSecret: environment.sessionSecret,
  })) notFound();
  const page = await createPublicPageHandler({
    database: getRuntimeDatabase().db,
  }).getPreview(pageId);
  if (!page) notFound();
  return <SourcePage page={{
    ...page,
    preview: true,
    sessionUrl: new URL(page.sessionUrl!, environment.baseOrigin).toString(),
    challengeUrl: new URL(page.challengeUrl, environment.baseOrigin).toString(),
    submissionUrl: new URL(page.submissionUrl, environment.baseOrigin).toString(),
  }} />;
}
