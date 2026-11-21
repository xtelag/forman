import type { Environment } from "@/server/config/environment";

export function browserFirstPartyOrigins(environment: Pick<Environment, "baseOrigin">) {
  return [environment.baseOrigin.origin];
}

export function browserCorsHeaders(
  allowedOrigins: string[],
  origin: string | null,
  firstPartyOrigins: readonly string[] = [],
): Record<string, string> {
  if (allowedOrigins.length === 0) {
    return {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "retry-after",
    };
  }

  if (
    origin &&
    (firstPartyOrigins.includes(origin) || allowedOrigins.includes(origin))
  ) {
    return {
      "access-control-allow-origin": origin,
      "access-control-expose-headers": "retry-after",
      vary: "Origin",
    };
  }

  return { vary: "Origin" };
}

export function isBrowserRequestOriginAllowed(
  allowedOrigins: string[],
  origin: string | null,
  firstPartyOrigins: readonly string[] = [],
) {
  return (
    origin === null ||
    allowedOrigins.length === 0 ||
    firstPartyOrigins.includes(origin) ||
    allowedOrigins.includes(origin)
  );
}

export function browserPreflightStatus(
  allowedOrigins: string[],
  origin: string | null,
  firstPartyOrigins: readonly string[] = [],
) {
  if (origin === null) return 400;
  return isBrowserRequestOriginAllowed(
    allowedOrigins,
    origin,
    firstPartyOrigins,
  )
    ? 204
    : 403;
}

export function applyBrowserCorsHeaders(
  response: Response,
  allowedOrigins: string[],
  origin: string | null,
  firstPartyOrigins: readonly string[] = [],
): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(
    browserCorsHeaders(allowedOrigins, origin, firstPartyOrigins),
  )) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function browserPreflightHeaders(
  allowedOrigins: string[],
  origin: string | null,
  firstPartyOrigins: readonly string[] = [],
): Record<string, string> {
  return {
    ...browserCorsHeaders(allowedOrigins, origin, firstPartyOrigins),
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}
