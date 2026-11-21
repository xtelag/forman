export function decodeAltchaPayload(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid ALTCHA payload");
  }
}
