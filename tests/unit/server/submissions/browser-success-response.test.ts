import { describe, expect, test } from "vitest";

import { browserSuccessResponse } from "@/server/submissions/browser-success-response";
import { readSuccessReturnTarget } from "@/server/submissions/success-return-target";

const options = {
  baseUrl: "https://forman.example.test",
  sourceId: "contact-form",
  sessionSecret: "a session secret that is at least thirty-two characters long",
  now: new Date("2026-08-18T10:00:00.000Z"),
};

describe("browserSuccessResponse", () => {
  test("returns JSON for fetch clients", async () => {
    const response = browserSuccessResponse(new Request("https://forman.example.test"), options);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  test("redirects traditional form navigation to the form-specific hosted confirmation page", () => {
    const response = browserSuccessResponse(
      new Request("https://forman.example.test", { headers: { accept: "text/html", referer: "https://www.example.test/contact" } }),
      options,
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/responses/success/contact-form");
    expect(readSuccessReturnTarget(location.searchParams.get("return"), options)).toBe("https://www.example.test");
  });

  test("keeps a configured success URL ahead of the hosted confirmation page", () => {
    const response = browserSuccessResponse(
      new Request("https://forman.example.test", { headers: { accept: "text/html", referer: "https://www.example.test/contact" } }),
      { ...options, successUrl: "https://customer.example.test/thanks" },
    );

    expect(response.headers.get("location")).toBe("https://customer.example.test/thanks");
  });

  test("returns Page submissions to the exact validated Page", () => {
    const response = browserSuccessResponse(
      new Request("https://forman.example.test/api/submit/contact-form", { headers: { accept: "text/html" } }),
      { ...options, pageId: "contact-prague" },
    );

    expect(new URL(response.headers.get("location")!).searchParams.get("return")).toBe("page:contact-prague");
  });

  test("falls back to the confirmation page when the browser sends a malformed referer", () => {
    const response = browserSuccessResponse(
      new Request("https://forman.example.test/api/submit/contact-form", {
        headers: { accept: "text/html", referer: "not a URL" },
      }),
      options,
    );

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/responses/success/contact-form");
  });
});
