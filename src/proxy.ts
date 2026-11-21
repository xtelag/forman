import { NextResponse, type NextRequest } from "next/server";

import { isMaintenanceMode } from "@/server/backup/maintenance-mode";
import { DEFAULT_DATABASE_PATH } from "@/server/config/environment";
import { requestOrigin } from "@/server/http/request-origin";

const RESTORE_PATH = "/api/admin/v1/backup/restore";
const adminApiPrefix = "/api/admin/v1/";
const administratorHeaders = {
  "cache-control": "no-store",
  "content-security-policy": "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function configuredUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPagePath(pathname: string) {
  return pathname === "/pages" || pathname.startsWith("/pages/");
}

function originBoundary(request: NextRequest) {
  const baseOrigin = configuredUrl(process.env.FORMAN_BASE_ORIGIN);
  if (!baseOrigin) return null;
  const trustProxy = process.env.FORMAN_TRUST_PROXY === "true";
  const origin = requestOrigin(request.headers, {
    // Next.js can derive request.url from the bind address and forwarded protocol.
    protocol: trustProxy ? undefined : baseOrigin.protocol,
    requestUrl: request.url,
    trustProxy,
  });
  if (origin === baseOrigin.origin) return null;

  return new NextResponse(
    request.method === "HEAD"
      ? null
      : "Request address does not match Forman's configured public URL (FORMAN_BASE_ORIGIN).\n",
    {
      status: 421,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    },
  );
}

function isAdministratorPath(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/") ||
    pathname === "/login" || pathname.startsWith("/login/") ||
    pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

function applyAdministratorResponsePolicy(
  request: NextRequest,
  response: NextResponse,
) {
  if (!isAdministratorPath(request.nextUrl.pathname)) return response;
  for (const [name, value] of Object.entries(administratorHeaders))
    response.headers.set(name, value);
  return response;
}

function trustedAdministratorOrigin(request: NextRequest) {
  const configuredBaseOrigin = process.env.FORMAN_BASE_ORIGIN;
  if (!configuredBaseOrigin) return request.nextUrl.origin;

  try {
    return new URL(configuredBaseOrigin).origin;
  } catch {
    return request.nextUrl.origin;
  }
}

export function proxy(request: NextRequest) {
  const isHealthProbe = request.nextUrl.pathname === "/health" &&
    ["GET", "HEAD"].includes(request.method);
  const boundaryResponse = isHealthProbe ? null : originBoundary(request);
  if (boundaryResponse) return boundaryResponse;
  const isAdminMutation =
    request.nextUrl.pathname.startsWith(adminApiPrefix) &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (
    isAdminMutation &&
    request.headers.get("origin") !== trustedAdministratorOrigin(request)
  ) {
    return applyAdministratorResponsePolicy(request, NextResponse.json(
      { error: "Untrusted administrator request origin" },
      { status: 403 },
    ));
  }
  const databasePath = process.env.FORMAN_DATABASE_PATH ?? DEFAULT_DATABASE_PATH;
  if (
    databasePath &&
    request.nextUrl.pathname !== RESTORE_PATH &&
    isMaintenanceMode(databasePath)
  ) {
    return applyAdministratorResponsePolicy(request, NextResponse.json(
      { error: "Forman is restoring a backup. Try again shortly." },
      { status: 503, headers: { "retry-after": "5" } },
    ));
  }
  const response = NextResponse.next();
  if (isPagePath(request.nextUrl.pathname)) {
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.set("x-content-type-options", "nosniff");
  }
  return applyAdministratorResponsePolicy(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
