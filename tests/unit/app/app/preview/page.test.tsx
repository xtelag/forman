import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  environment: {
    baseOrigin: new URL("https://forman.example.test"),
    sessionSecret: "s".repeat(32),
  },
  getPreview: vi.fn(),
  findPageByPublicId: vi.fn(),
  requestHeaders: new Headers(),
}));

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => state.requestHeaders }));
vi.mock("next/navigation", () => navigation);
vi.mock("@/server/config/environment", () => ({
  loadEnvironment: () => state.environment,
}));
vi.mock("@/server/db/runtime", () => ({
  getRuntimeDatabase: () => ({ db: {} }),
}));
vi.mock("@/server/pages/public-page-handler", () => ({
  createPublicPageHandler: () => ({ getPreview: state.getPreview }),
}));
vi.mock("@/server/pages/page-service", () => ({
  findPageByPublicId: state.findPageByPublicId,
}));

import LocalPagePreview from "@/app/app/preview/[pageId]/page";
import { readPagePreviewToken } from "@/server/pages/page-preview-token";

const now = new Date("2026-08-21T12:00:00.000Z");

describe("administrator Page preview redirect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    state.requestHeaders = new Headers({
      host: "forman.example.test",
      "x-forwarded-proto": "https",
    });
    state.getPreview.mockReset().mockResolvedValue({ pageId: "page-a" });
    state.findPageByPublicId.mockReset().mockResolvedValue(null);
    navigation.notFound.mockClear();
    navigation.redirect.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  test("redirects from the administrator origin to a signed preview on the same origin", async () => {
    await expect(LocalPagePreview({
      params: Promise.resolve({ pageId: "page-a" }),
    })).rejects.toThrow("NEXT_REDIRECT");

    const location = navigation.redirect.mock.calls[0]?.[0];
    const target = new URL(location);
    expect(target.origin).toBe("https://forman.example.test");
    expect(target.pathname).toBe("/pages/preview/page-a");
    expect(target.searchParams.getAll("preview")).toHaveLength(1);
    expect(readPagePreviewToken(target.searchParams.get("preview"), {
      now,
      pageId: "page-a",
      sessionSecret: state.environment.sessionSecret,
    })).toBe(true);
  });

  test("rejects an unknown origin for the administrator preview", async () => {
    state.requestHeaders = new Headers({
      host: "unknown.example.test",
      "x-forwarded-proto": "https",
    });

    await expect(LocalPagePreview({
      params: Promise.resolve({ pageId: "page-a" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.getPreview).not.toHaveBeenCalled();
  });

  test("returns to the Page detail when an existing Page cannot be previewed", async () => {
    state.getPreview.mockResolvedValue(null);
    state.findPageByPublicId.mockResolvedValue({ pageId: "page-a" });

    await expect(LocalPagePreview({
      params: Promise.resolve({ pageId: "page-a" }),
    })).rejects.toThrow("NEXT_REDIRECT:/app/pages/page-a");
  });
});
