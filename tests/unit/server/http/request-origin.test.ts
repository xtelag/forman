import { describe, expect, test } from "vitest";

import { isBaseOrigin, requestOrigin } from "@/server/http/request-origin";

describe("Request origin", () => {
  test("compares administrator origins exactly", () => {
    const baseUrl = new URL("https://forman.example.test");

    expect(isBaseOrigin("https://forman.example.test", baseUrl)).toBe(true);
    expect(isBaseOrigin("https://pages.forman.example.test", baseUrl)).toBe(
      false,
    );
  });

  test("reads the public origin from forwarded request headers", () => {
    expect(requestOrigin(new Headers({ host: "forman-app:3000", "x-forwarded-host": "pages.forman.example.test", "x-forwarded-proto": "https" }), {
      requestUrl: "http://forman-app:3000/pages/page-a",
      trustProxy: true,
    })).toBe("https://pages.forman.example.test");
  });

  test("ignores forged forwarded origin headers when proxy trust is disabled", () => {
    expect(requestOrigin(new Headers({
      host: "forman.example.test",
      "x-forwarded-host": "pages.forman.example.test",
      "x-forwarded-proto": "https",
    }), {
      requestUrl: "https://forman.example.test/pages/page-a",
      trustProxy: false,
    })).toBe("https://forman.example.test");
  });

  test("ignores forwarded origin headers by default", () => {
    expect(requestOrigin(new Headers({
      host: "forman.example.test",
      "x-forwarded-host": "pages.forman.example.test",
      "x-forwarded-proto": "https",
    }), {
      requestUrl: "https://forman.example.test/pages/page-a",
    })).toBe("https://forman.example.test");
  });

  test("preserves an HTTP localhost origin without forwarded headers", () => {
    expect(requestOrigin(new Headers({ host: "localhost:3000" }), {
      requestUrl: "http://localhost:3000/pages/page-a",
      trustProxy: false,
    })).toBe("http://localhost:3000");
  });
});
