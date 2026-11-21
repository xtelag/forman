import { describe, expect, test } from "vitest";

import {
  createPagePreviewToken,
  readPagePreviewToken,
} from "@/server/pages/page-preview-token";

const sessionSecret = "a-session-secret-that-is-at-least-thirty-two-chars";
const createdAt = new Date("2026-08-21T12:00:00.000Z");

describe("Page preview token", () => {
  test("accepts a valid token for its exact Page", () => {
    const token = createPagePreviewToken("page-a", {
      now: createdAt,
      sessionSecret,
    });

    expect(
      readPagePreviewToken(token, {
        now: new Date("2026-08-21T12:09:59.999Z"),
        pageId: "page-a",
        sessionSecret,
      }),
    ).toBe(true);
  });

  test("rejects an expired or Page-mismatched token", () => {
    const token = createPagePreviewToken("page-a", {
      now: createdAt,
      sessionSecret,
    });

    expect(
      readPagePreviewToken(token, {
        now: createdAt,
        pageId: "page-b",
        sessionSecret,
      }),
    ).toBe(false);
    expect(
      readPagePreviewToken(token, {
        now: new Date("2026-08-21T12:10:00.000Z"),
        pageId: "page-a",
        sessionSecret,
      }),
    ).toBe(false);
  });
});
