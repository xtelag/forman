import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  environment: {
    baseOrigin: new URL("https://forman.example.test"),
  },
  get: vi.fn(),
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

vi.mock("next/headers", () => ({
  headers: async () => state.requestHeaders,
}));
vi.mock("next/navigation", () => navigation);
vi.mock("@/server/config/environment", () => ({
  loadEnvironment: () => state.environment,
}));
vi.mock("@/server/db/runtime", () => ({
  getRuntimeDatabase: () => ({ db: {} }),
}));
vi.mock("@/server/pages/public-page-handler", () => ({
  createPublicPageHandler: () => ({ get: state.get }),
}));

import PublicPageRoute, { generateMetadata } from "@/app/pages/[pageId]/page";

const page = {
  altchaEnabled: false,
  challengeUrl: "/api/challenge/source-a",
  fields: [{ htmlControl: "email" as const, label: "Email", name: "email", required: true }],
  honeypotEnabled: false,
  honeypotFieldNames: ["forman_company_website"],
  pageId: "page-a",
  sourceId: "source-a",
  submissionUrl: "/api/submit/source-a?page=page-a",
  submitLabel: "Send",
  title: "Campaign",
};

describe("published Page route", () => {
  beforeEach(() => {
    state.requestHeaders = new Headers({
      host: "forman.example.test",
      "x-forwarded-proto": "https",
    });
    state.get.mockReset();
    navigation.notFound.mockClear();
    navigation.redirect.mockClear();
  });

  afterEach(cleanup);

  test("renders a published standard Page only on the base origin", async () => {
    state.get.mockResolvedValue(page);

    render(await PublicPageRoute({ params: Promise.resolve({ pageId: "page-a" }) }));

    expect(screen.getByRole("form", { name: "Campaign" })).toBeVisible();
  });


  test("does not render a Page from an unknown origin", async () => {
    state.requestHeaders = new Headers({
      host: "unknown.example.test",
      "x-forwarded-proto": "https",
    });

    await expect(
      PublicPageRoute({ params: Promise.resolve({ pageId: "page-a" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.get).not.toHaveBeenCalled();
  });

  test("names the browser tab after the form title only", async () => {
    state.get.mockResolvedValue({
      ...page,
      presentation: { fallbacks: { name: "guest" } },
      title: "Hello, {{name}}",
    });

    await expect(
      generateMetadata({ params: Promise.resolve({ pageId: "page-a" }) }),
    ).resolves.toEqual({ title: { absolute: "Hello, guest" } });
  });

  test("does not reveal a form title to an unknown origin", async () => {
    state.requestHeaders = new Headers({
      host: "unknown.example.test",
      "x-forwarded-proto": "https",
    });

    await expect(
      generateMetadata({ params: Promise.resolve({ pageId: "page-a" }) }),
    ).resolves.toEqual({ title: "Page not found" });
    expect(state.get).not.toHaveBeenCalled();
  });
});
