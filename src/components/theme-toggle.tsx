"use client";

import { useHydrated, useTheme } from "@teispace/next-themes";
import { Moon, Sun } from "lucide-react";

import { IconButton } from "@/components/patterns/icon-button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHydrated();

  if (!mounted) {
    return (
      <IconButton
        aria-label="Theme preference loading"
        disabled
        size={44}
        type="button"
        variant="subtle"
        color="gray"
      >
        <Moon size={18} aria-hidden="true" />
      </IconButton>
    );
  }

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <IconButton
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
      size={44}
      type="button"
      variant="subtle"
      color="gray"
    >
      {resolvedTheme === "dark" ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </IconButton>
  );
}
