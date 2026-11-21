import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { createPagePreviewToken } from "@/server/pages/page-preview-token";
import { findPageByPublicId } from "@/server/pages/page-service";
import { isBaseOrigin, requestOrigin } from "@/server/http/request-origin";
import { createPublicPageHandler } from "@/server/pages/public-page-handler";

export default async function LocalPagePreview({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const [environment, { pageId }] = await Promise.all([
    loadEnvironment(process.env),
    params,
  ]);
  if (!isBaseOrigin(requestOrigin(await headers(), {
    protocol: environment.baseOrigin.protocol,
    trustProxy: environment.trustProxy,
  }) ?? "", environment.baseOrigin)) {
    notFound();
  }
  const database = getRuntimeDatabase().db;
  const page = await createPublicPageHandler({
    database,
  }).getPreview(pageId);
  if (!page) {
    const existingPage = await findPageByPublicId(database, pageId);
    if (existingPage)
      redirect(`/app/pages/${encodeURIComponent(existingPage.pageId)}`);
    notFound();
  }
  const previewToken = createPagePreviewToken(page.pageId, {
    now: new Date(),
    sessionSecret: environment.sessionSecret,
  });
  redirect(new URL(
    `/pages/preview/${encodeURIComponent(page.pageId)}?preview=${encodeURIComponent(previewToken)}`,
    environment.baseOrigin,
  ).toString());
}
