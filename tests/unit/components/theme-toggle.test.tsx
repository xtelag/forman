import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { setTheme, themeState } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  themeState: {
    hydrated: true,
    resolvedTheme: "light" as "dark" | "light" | undefined,
  },
}));

vi.mock("@teispace/next-themes", () => ({
  useHydrated: () => themeState.hydrated,
  useTheme: () => ({
    setTheme,
    resolvedTheme: themeState.resolvedTheme,
    theme: themeState.resolvedTheme,
  }),
}));

import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    cleanup();
    setTheme.mockClear();
    themeState.hydrated = true;
    themeState.resolvedTheme = "light";
  });

  test("uses the next theme action in both supported theme states", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(
      screen.queryByRole("radio", { name: "System" }),
    ).not.toBeInTheDocument();
    await user.click(toggle);

    expect(setTheme).toHaveBeenCalledWith("dark");

    themeState.resolvedTheme = "dark";
    render(<ThemeToggle />);

    const lightToggle = screen.getByRole("button", {
      name: "Switch to light theme",
    });
    await user.click(lightToggle);

    expect(setTheme).toHaveBeenLastCalledWith("light");
  });

  test("explains the keyboard-focused action with a tooltip", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Switch to dark theme",
    );
    await user.keyboard("{Enter}");
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  test("keeps the loading control disabled and explains it on keyboard focus", async () => {
    themeState.hydrated = false;
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Theme preference loading" }),
    ).toBeDisabled();
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Theme preference loading",
    );
    await user.keyboard("{Enter}");
    expect(setTheme).not.toHaveBeenCalled();
  });

  test("keeps the server-rendered control independent from a saved client theme", () => {
    themeState.hydrated = false;
    themeState.resolvedTheme = undefined;

    const markup = renderToStaticMarkup(
      <MantineProvider>
        <ThemeToggle />
      </MantineProvider>,
    );

    expect(markup).toContain('aria-label="Theme preference loading"');
    expect(markup).toContain("disabled");
  });
});
