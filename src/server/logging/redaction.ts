const REDACTED = "[REDACTED]";

const sensitiveKey = /^(authorization|cookie|password|payload|secret|token)$/i;
const sensitiveIdentifier = /(?:client[_-]?ip|remote[_-]?addr(?:ess)?|x-forwarded-for)/i;

function isSensitiveKey(key: string) {
  return sensitiveKey.test(key) || sensitiveIdentifier.test(key);
}

export function redactLogContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogContext);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactLogContext(nestedValue),
    ]),
  );
}

export function safeCleanupErrorLogContext(_error: unknown) {
  void _error;

  return redactLogContext({ event: "retention.cleanup.failed" });
}
