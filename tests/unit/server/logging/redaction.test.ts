import { describe, expect, test } from "vitest";

import { redactLogContext, safeCleanupErrorLogContext } from "@/server/logging/redaction";

describe("redactLogContext", () => {
  test("removes credentials, client addresses, and submission payload values", () => {
    const result = redactLogContext({
      authorization: "Bearer super-secret-token",
      clientIp: "203.0.113.4",
      cookie: "forman_session=opaque-session",
      event: "submission.accepted",
      payload: { email: ["person@example.test"], message: ["private message"] },
      nested: { password: "a-long-password", requestId: "request-123" },
    });

    expect(result).toEqual({
      authorization: "[REDACTED]",
      clientIp: "[REDACTED]",
      cookie: "[REDACTED]",
      event: "submission.accepted",
      payload: "[REDACTED]",
      nested: { password: "[REDACTED]", requestId: "request-123" },
    });
    expect(JSON.stringify(result)).not.toContain("person@example.test");
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  test("uses a fixed context for retention cleanup failures", () => {
    expect(safeCleanupErrorLogContext(new Error("Bearer super-secret-token"))).toEqual({
      event: "retention.cleanup.failed",
    });
  });
});
