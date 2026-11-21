import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@teispace/next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const state = vi.hoisted(() => ({
  environment: {
    baseOrigin: new URL("https://forman.example.test"),
    sessionSecret: "s".repeat(32),
  },
  findPage: vi.fn(),
}));

vi.mock("@/server/config/environment", () => ({
  loadEnvironment: () => state.environment,
}));
vi.mock("@/server/db/runtime", () => ({
  getRuntimeDatabase: () => ({ db: {} }),
}));
vi.mock("@/server/pages/page-service", () => ({
  findPageByPublicId: state.findPage,
}));

import SuccessResponsePage from "@/app/responses/success/[sourceId]/page";

describe("Page submission success response", () => {
  beforeEach(() => {
    state.findPage.mockReset().mockResolvedValue({
      enabled: true,
      pageId: "page-a",
      sourceEnabled: true,
      sourcePublicId: "source-a",
    });
  });

  afterEach(cleanup);

  test("presents the success confirmation and a safe return action", async () => {
    render(
      await SuccessResponsePage({
        params: Promise.resolve({ sourceId: "source-a" }),
        searchParams: Promise.resolve({ return: "page:page-a" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Submission received" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Submission received" }).parentElement
        ?.parentElement,
    ).toHaveStyle({ textAlign: "center" });
    expect(screen.getByRole("main").querySelector("svg")).toHaveClass(
      "size-12",
      "text-emerald-600",
    );
    expect(screen.getByText("The submission has been received.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Return to page" }),
    ).toHaveAttribute("href", "https://forman.example.test/pages/page-a");
    expect(
      screen.getByRole("link", { name: "Return to page" }),
    ).toHaveAttribute("data-variant", "default");
    expect(
      screen.getByRole("link", { name: "Return to page" }),
    ).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  test("omits a Page return link when the Page is no longer published", async () => {
    state.findPage.mockResolvedValue({
      enabled: false,
      pageId: "page-a",
      sourceEnabled: true,
      sourcePublicId: "source-a",
    });

    render(
      await SuccessResponsePage({
        params: Promise.resolve({ sourceId: "source-a" }),
        searchParams: Promise.resolve({ return: "page:page-a" }),
      }),
    );

    expect(
      screen.queryByRole("link", { name: "Return to page" }),
    ).not.toBeInTheDocument();
  });
});
