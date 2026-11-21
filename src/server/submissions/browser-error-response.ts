type BrowserErrorKind = "invalid" | "rate-limited" | "unavailable";

const errors: Record<BrowserErrorKind, { message: string; status: number }> = {
  invalid: { message: "Invalid payload", status: 400 },
  "rate-limited": { message: "Too many requests", status: 429 },
  unavailable: { message: "Source unavailable", status: 503 },
};

export function browserErrorResponse(
  request: Request,
  { baseUrl, sourceId, kind, retryAfter }: { baseUrl: string; sourceId: string; kind: BrowserErrorKind; retryAfter?: string | null },
) {
  const error = errors[kind];
  if (request.headers.get("accept")?.includes("text/html")) {
    return Response.redirect(new URL(`/responses/${kind}/${encodeURIComponent(sourceId)}`, baseUrl), 303);
  }
  return Response.json({ error: error.message }, {
    ...(retryAfter ? { headers: { "retry-after": retryAfter } } : {}),
    status: error.status,
  });
}
