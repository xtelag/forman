import {
  isUnavailableStatus,
  probeServer,
  reportServerReachable,
} from "@/client/connection-status";

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function readErrorMessage(body: unknown) {
  if (body && typeof body === "object") {
    const { error, message } = body as { error?: unknown; message?: unknown };
    if (typeof error === "string") return error;
    if (typeof message === "string") return message;
  }
  return "Request failed";
}

function requestHeaders(headers: HeadersInit | undefined) {
  const result = new Headers(headers);
  if (!result.has("content-type"))
    result.set("content-type", "application/json");
  return Object.fromEntries(result.entries());
}

export function requestSessionLogin() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("forman:session-expired"));
  }
}

export async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: requestHeaders(init.headers),
    });
  } catch (error) {
    // A network failure may be an outage; the liveness probe decides.
    void probeServer();
    throw error;
  }
  if (isUnavailableStatus(response.status)) void probeServer();
  else reportServerReachable();
  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => ({}));
  if (response.status === 401) requestSessionLogin();
  if (!response.ok)
    throw new AdminApiError(response.status, readErrorMessage(body));
  return body as T;
}
