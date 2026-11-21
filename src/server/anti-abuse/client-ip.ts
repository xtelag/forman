import { isIP } from "node:net";

export function getTrustedClientIp(headers: Headers, trustProxy: boolean) {
  if (!trustProxy) {
    return null;
  }

  const forwardedFor = headers.get("x-forwarded-for");

  if (!forwardedFor || forwardedFor.includes(",") || isIP(forwardedFor) === 0) {
    return null;
  }

  return forwardedFor;
}
