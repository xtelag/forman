import { SearchX } from "lucide-react";

import { PublicStatePage } from "@/components/public/public-state-page";

export function externalReturnOrigin(
  referer: string | null,
  formanBaseUrl: string | URL,
) {
  if (!referer) return null;
  try {
    const origin = new URL(referer).origin;
    const formanOrigin = new URL(formanBaseUrl).origin;
    const url = new URL(origin);
    if (
      origin === formanOrigin ||
      (url.protocol !== "https:" && url.hostname !== "localhost")
    )
      return null;
    return origin;
  } catch {
    return null;
  }
}

export function GeneralNotFoundPage({
  returnOrigin,
}: {
  returnOrigin: string | null;
}) {
  return (
    <PublicStatePage
      action={
        returnOrigin
          ? { href: returnOrigin, label: "Return to website" }
          : { href: "/app", label: "Back to home", outline: true }
      }
      description="This page is not available."
      icon={<SearchX className="size-40 sm:size-52" strokeWidth={1.2} />}
      title="Page not found"
    />
  );
}
