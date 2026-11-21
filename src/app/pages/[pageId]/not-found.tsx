import type { Metadata } from "next";
import { headers } from "next/headers";

import { externalReturnOrigin, GeneralNotFoundPage } from "@/components/public/not-found-page";
import { loadEnvironment } from "@/server/config/environment";

export const metadata: Metadata = { title: "Page not found" };

export default async function PublicPageNotFound() {
  const requestHeaders = await headers();
  const environment = loadEnvironment(process.env);
  return <GeneralNotFoundPage returnOrigin={externalReturnOrigin(requestHeaders.get("referer"), environment.baseOrigin)} />;
}
