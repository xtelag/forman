import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  environment: {
    baseOrigin: new URL("https://forman.example.test"),
    sessionSecret: "s".repeat(32),
  },
  getPreview: vi.fn(),
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

import PublicPagePreviewRoute from "@/app/pages/preview/[pageId]/page";
import { createPagePreviewToken } from "@/server/pages/page-preview-token";

const now = new Date("2026-08-21T12:00:00.000Z");
const page = {
  altchaEnabled: false,
  challengeUrl: "/api/challenge/source-a",
  fields: [{ htmlControl: "text" as const, label: "Name", name: "name", required: true }],
  honeypotEnabled: false,
  honeypotFieldNames: ["forman_company_website"],
  pageId: "page-a",
  sourceId: "source-a",
  submissionUrl: "/api/submit/source-a?page=page-a",
  submitLabel: "Send",
  title: "Draft campaign",
};

describe("Page preview route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    state.requestHeaders = new Headers({
      host: "forman.example.test",
      "x-forwarded-proto": "https",
    });
    state.getPreview.mockReset();
    navigation.notFound.mockClear();
    navigation.redirect.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function token() {
    return createPagePreviewToken("page-a", {
      now,
      sessionSecret: state.environment.sessionSecret,
    });
  }

  test("renders an unpublished standard Page with a valid exact token", async () => {
    state.getPreview.mockResolvedValue(page);

    render(await PublicPagePreviewRoute({
      params: Promise.resolve({ pageId: "page-a" }),
      searchParams: Promise.resolve({ preview: token() }),
    }));

    expect(screen.getByRole("form", { name: "Draft campaign" })).toBeVisible();
  });


  test("rejects duplicate preview parameters instead of accepting the first", async () => {
    const preview = token();

    await expect(PublicPagePreviewRoute({
      params: Promise.resolve({ pageId: "page-a" }),
      searchParams: Promise.resolve({ preview: [preview, preview] as unknown as string }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.getPreview).not.toHaveBeenCalled();
  });
});
