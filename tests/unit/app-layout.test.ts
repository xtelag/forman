import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@teispace/next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@teispace/next-themes/server", () => ({
  getTheme: vi.fn(),
}));

let metadata: typeof import("@/app/layout").metadata;

beforeAll(async () => {
  ({ metadata } = await import("@/app/layout"));
});

describe("application metadata", () => {
  test("describes Forman accurately without the retired slogan", () => {
    expect(metadata.description).toBe("Self-hosted backend for receiving public form submissions.");
    expect(metadata.description).not.toContain("Sources in. Data ready.");
  });

  test("titles pages as their name followed by Forman", () => {
    expect(metadata.title).toEqual({ default: "Forman", template: "%s · Forman" });
  });

  test("publishes the Forman monogram as the SVG favicon", () => {
    expect(metadata.icons).toEqual({
      icon: [{
        sizes: "any",
        type: "image/svg+xml",
        url: "/brand/logo-f-ascii.svg",
      }],
    });
  });
});
