export function isBaseOrigin(requestOrigin: string, baseUrl: URL) {
  return baseUrl.origin === requestOrigin;
}

type RequestOriginOptions = {
  protocol?: string;
  requestUrl?: string | URL;
  trustProxy?: boolean;
};

function requestUrl(value: string | URL | undefined) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function singleHeaderValue(value: string | null) {
  if (!value || value.includes(",")) return null;
  return value.trim() || null;
}

export function requestOrigin(
  requestHeaders: Headers,
  {
    protocol,
    requestUrl: rawRequestUrl,
    trustProxy = false,
  }: RequestOriginOptions = {},
) {
  const fallback = requestUrl(rawRequestUrl);
  const forwardedHost = trustProxy
    ? singleHeaderValue(requestHeaders.get("x-forwarded-host"))
    : null;
  const host =
    forwardedHost ?? requestHeaders.get("host") ?? fallback?.host ?? null;
  if (!host || /[\s,/@\\?#]/.test(host)) return null;
  const forwardedProtocol = trustProxy
    ? singleHeaderValue(requestHeaders.get("x-forwarded-proto"))
    : null;
  const resolvedProtocol =
    forwardedProtocol ?? protocol ?? fallback?.protocol ?? "https:";
  try {
    return new URL(`${resolvedProtocol.replace(/:$/, "")}://${host}`).origin;
  } catch {
    return null;
  }
}
