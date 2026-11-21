import { describe, expect, test } from "vitest";

import { browserErrorResponse } from "@/server/submissions/browser-error-response";

describe("browserErrorResponse", () => {
  test("redirects an HTML request to the matching response page", () => {
    const response = browserErrorResponse(
      new Request("https://forman.test/api/submit/contact", { headers: { accept: "text/html" } }),
      { baseUrl: "https://forman.test", sourceId: "contact", kind: "invalid" },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://forman.test/responses/invalid/contact");
  });

  test("keeps JSON errors machine-readable", () => {
    const response = browserErrorResponse(
      new Request("https://forman.test/api/submit/contact", { headers: { accept: "application/json" } }),
      { baseUrl: "https://forman.test", sourceId: "contact", kind: "rate-limited" },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("preserves the retry delay for a rate-limited JSON response", () => {
    const response = browserErrorResponse(
      new Request("https://forman.test/api/submit/contact", { headers: { accept: "application/json" } }),
      { baseUrl: "https://forman.test", sourceId: "contact", kind: "rate-limited", retryAfter: "60" },
    );

    expect(response.headers.get("retry-after")).toBe("60");
  });
});
