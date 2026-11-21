import { describe, expect, test } from "vitest";

import { createResponsePageResponse } from "@/server/submissions/response-page";

describe("response pages", () => {
  test("returns a safe unavailable page with its final status", async () => {
    const response = createResponsePageResponse("unavailable");

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Source unavailable");
    expect(html).toContain("font-family:ui-sans-serif");
    expect(html).toContain('class="card"');
  });
});
