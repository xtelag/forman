import { describe, expect, test } from "vitest";

import {
  applyBrowserCorsHeaders,
  browserCorsHeaders,
  browserPreflightHeaders,
  browserPreflightStatus,
  isBrowserRequestOriginAllowed,
} from "@/server/sources/cors";

describe("browserCorsHeaders", () => {
  test("permits any origin for an empty allowlist", () => {
    expect(browserCorsHeaders([], "https://any.example.test")).toEqual({
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "retry-after",
    });
  });

  test("permits only explicit origins and varies the response", () => {
    expect(browserCorsHeaders(["https://allowed.example.test"], "https://allowed.example.test")).toEqual({
      "access-control-allow-origin": "https://allowed.example.test",
      "access-control-expose-headers": "retry-after",
      vary: "Origin",
    });
    expect(browserCorsHeaders(["https://allowed.example.test"], "https://other.example.test")).toEqual({
      vary: "Origin",
    });
  });

  test("permits a configured first-party Pages origin alongside an external allowlist", () => {
    expect(browserCorsHeaders(
      ["https://allowed.example.test"],
      "https://pages.forman.example.test",
      ["https://forman.example.test", "https://pages.forman.example.test"],
    )).toEqual({
      "access-control-allow-origin": "https://pages.forman.example.test",
      "access-control-expose-headers": "retry-after",
      vary: "Origin",
    });
  });
});

describe("browserPreflightHeaders", () => {
  test("allows only the browser submission contract", () => {
    expect(browserPreflightHeaders([], "https://any.example.test")).toEqual({
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "retry-after",
    });
  });
});

describe("browser origin enforcement", () => {
  test("rejects a supplied origin that is not authorized", () => {
    expect(isBrowserRequestOriginAllowed(["https://allowed.example.test"], "https://other.example.test")).toBe(false);
  });

  test("lets an originless submission continue to its anti-abuse checks", () => {
    expect(isBrowserRequestOriginAllowed(["https://allowed.example.test"], null)).toBe(true);
  });

  test("always permits the configured first-party origin", () => {
    expect(isBrowserRequestOriginAllowed(
      ["https://allowed.example.test"],
      "https://pages.forman.example.test",
      ["https://forman.example.test", "https://pages.forman.example.test"],
    )).toBe(true);
  });

  test("permits first-party Pages preflight alongside an external allowlist", () => {
    expect(browserPreflightStatus(
      ["https://allowed.example.test"],
      "https://pages.forman.example.test",
      ["https://forman.example.test", "https://pages.forman.example.test"],
    )).toBe(204);
  });

  test("rejects an originless or unauthorized preflight", () => {
    expect(browserPreflightStatus(["https://allowed.example.test"], null)).toBe(400);
    expect(browserPreflightStatus(["https://allowed.example.test"], "https://other.example.test")).toBe(403);
  });
});

describe("applyBrowserCorsHeaders", () => {
  test("adds the applicable headers to any browser response", () => {
    const response = applyBrowserCorsHeaders(
      new Response("Too many requests", { status: 429 }),
      ["https://allowed.example.test"],
      "https://allowed.example.test",
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://allowed.example.test");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  test("preserves a redirect response whose headers are immutable", () => {
    const response = applyBrowserCorsHeaders(
      Response.redirect("https://forman.example.test/responses/success/contact", 303),
      [],
      null,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://forman.example.test/responses/success/contact");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("adds CORS headers for a first-party Pages origin alongside an external allowlist", () => {
    const response = applyBrowserCorsHeaders(
      new Response("Challenge"),
      ["https://allowed.example.test"],
      "https://pages.forman.example.test",
      ["https://forman.example.test", "https://pages.forman.example.test"],
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("https://pages.forman.example.test");
    expect(response.headers.get("vary")).toBe("Origin");
  });
});
