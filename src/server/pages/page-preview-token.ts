import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 10 * 60 * 1_000;
const SIGNATURE_PREFIX = "forman-page-preview-v1";

type PreviewTokenOptions = {
  now: Date;
  sessionSecret: string;
};

type ReadPreviewTokenOptions = PreviewTokenOptions & {
  pageId: string;
};

type PreviewTokenPayload = {
  expiresAt: number;
  pageId: string;
};

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${SIGNATURE_PREFIX}.${payload}`, "utf8")
    .digest("base64url");
}

export function createPagePreviewToken(
  pageId: string,
  { now, sessionSecret }: PreviewTokenOptions,
) {
  const payload = Buffer.from(
    JSON.stringify({
      expiresAt: now.getTime() + MAX_AGE_MS,
      pageId,
    } satisfies PreviewTokenPayload),
  ).toString("base64url");
  return `${payload}.${signature(payload, sessionSecret)}`;
}

export function readPagePreviewToken(
  token: string | null | undefined,
  { now, pageId, sessionSecret }: ReadPreviewTokenOptions,
) {
  if (!token) return false;
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) return false;

  const expectedSignature = signature(payload, sessionSecret);
  const actual = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PreviewTokenPayload;
    return (
      parsed.pageId === pageId &&
      Number.isFinite(parsed.expiresAt) &&
      parsed.expiresAt > now.getTime()
    );
  } catch {
    return false;
  }
}
