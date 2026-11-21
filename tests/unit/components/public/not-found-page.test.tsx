import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@teispace/next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import {
  externalReturnOrigin,
  GeneralNotFoundPage,
} from "@/components/public/not-found-page";

describe("GeneralNotFoundPage", () => {
  afterEach(cleanup);

  test("guides visitors from a missing page back home with a neutral outline action", () => {
    render(<GeneralNotFoundPage returnOrigin={null} />);

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    expect(screen.getByText("This page is not available.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  test("returns visitors to a known external origin", () => {
    render(<GeneralNotFoundPage returnOrigin="https://www.example.test" />);

    expect(
      screen.getByRole("link", { name: "Return to website" }),
    ).toHaveAttribute("href", "https://www.example.test");
  });

  test("derives only a safe external origin from the referer", () => {
    expect(
      externalReturnOrigin(
        "https://www.example.test/contact",
        "https://forman.example.test",
      ),
    ).toBe("https://www.example.test");
    expect(
      externalReturnOrigin(
        "https://forman.example.test/pages/contact",
        "https://forman.example.test",
      ),
    ).toBeNull();
    expect(
      externalReturnOrigin(
        "http://www.example.test/contact",
        "https://forman.example.test",
      ),
    ).toBeNull();
    expect(
      externalReturnOrigin("not a URL", "https://forman.example.test"),
    ).toBeNull();
  });
});
