import { createSuccessReturnTarget } from "./success-return-target";

type BrowserSuccessOptions = {
  baseUrl: string;
  sourceId: string;
  now?: Date;
  pageId?: string | null;
  sessionSecret: string;
  successUrl?: string | null;
};

export function browserSuccessResponse(request: Request, { baseUrl, sourceId, now = new Date(), pageId, sessionSecret, successUrl }: BrowserSuccessOptions) {
  if (request.headers.get("accept")?.includes("text/html")) {
    if (successUrl) return Response.redirect(successUrl, 303);
    const responseUrl = new URL(`/responses/success/${encodeURIComponent(sourceId)}`, baseUrl);
    if (pageId) {
      responseUrl.searchParams.set("return", `page:${pageId}`);
    } else {
      const referer = request.headers.get("referer");
      const externalReferer = (() => {
      try {
          return referer !== null && new URL(referer).origin !== new URL(baseUrl).origin ? referer : null;
      } catch {
          return null;
      }
      })();
      const returnTarget = createSuccessReturnTarget(externalReferer, { sourceId, now, sessionSecret });
      if (returnTarget) responseUrl.searchParams.set("return", returnTarget);
    }
    return Response.redirect(responseUrl.toString(), 303);
  }

  return Response.json({ success: true }, { status: 202 });
}
