import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { SourcePage } from "@/components/public/source-page";
import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { createPublicPageHandler } from "@/server/pages/public-page-handler";
import { isBaseOrigin, requestOrigin } from "@/server/http/request-origin";
import { publicFormDocumentTitle } from "@/shared/document-title";

// Metadata and the page render share one lookup per request.
const loadPublicPage = cache(async (pageId: string) => {
  const environment = loadEnvironment(process.env);
  if (!isBaseOrigin(requestOrigin(await headers(), {
    protocol: environment.baseOrigin.protocol,
    trustProxy: environment.trustProxy,
  }) ?? "", environment.baseOrigin)) return null;
  return createPublicPageHandler({ database: getRuntimeDatabase().db }).get(pageId);
});

export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  const page = await loadPublicPage((await params).pageId);
  if (!page) return { title: "Page not found" };
  return { title: { absolute: publicFormDocumentTitle(page.title, page.presentation?.fallbacks) } };
}

export default async function PublicPageRoute({ params }: { params: Promise<{ pageId: string }> }) {
  const environment = loadEnvironment(process.env);
  const { pageId } = await params;
  const page = await loadPublicPage(pageId);
  if (!page) notFound();
  return <SourcePage page={{
    ...page,
    sessionUrl: new URL(page.sessionUrl!, environment.baseOrigin).toString(),
    challengeUrl: new URL(page.challengeUrl, environment.baseOrigin).toString(),
    submissionUrl: new URL(page.submissionUrl, environment.baseOrigin).toString(),
  }} />;
}
