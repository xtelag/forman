import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 10 * 60 * 1_000;
const SIGNATURE_PREFIX = "forman-success-return-v1";

type ReturnTargetOptions = {
  sourceId: string;
  now: Date;
  sessionSecret: string;
};

type ReturnTargetPayload = {
  expiresAt: number;
  sourceId: string;
  origin: string;
};

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`${SIGNATURE_PREFIX}.${payload}`, "utf8").digest("base64url");
}

function isAllowedOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.origin === value && (url.protocol === "https:" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

export function createSuccessReturnTarget(referer: string | null, { sourceId, now, sessionSecret }: ReturnTargetOptions) {
  if (!referer) return null;
  let origin: string;
  try {
    origin = new URL(referer).origin;
  } catch {
    return null;
  }
  if (!isAllowedOrigin(origin)) return null;
  const payload = Buffer.from(JSON.stringify({ expiresAt: now.getTime() + MAX_AGE_MS, sourceId, origin } satisfies ReturnTargetPayload)).toString("base64url");
  return `${payload}.${signature(payload, sessionSecret)}`;
}

export function readSuccessReturnTarget(token: string | null, { sourceId, now, sessionSecret }: ReturnTargetOptions) {
  if (!token) return null;
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) return null;
  const expectedSignature = signature(payload, sessionSecret);
  const actual = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ReturnTargetPayload;
    if (parsed.sourceId !== sourceId || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now.getTime() || !isAllowedOrigin(parsed.origin)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
