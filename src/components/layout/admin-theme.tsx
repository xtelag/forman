"use client";

import {
  ActionIcon,
  Alert,
  createTheme,
  MantineProvider,
  defaultVariantColorsResolver,
} from "@mantine/core";
import { useTheme } from "@teispace/next-themes";
import type { ReactNode } from "react";
import classes from "./admin-select.module.css";

const adminTheme = createTheme({
  variantColorResolver: (input) => {
    const colors = defaultVariantColorsResolver(input);
    return input.variant === "light"
      ? { ...colors, color: "var(--mantine-color-text)" }
      : colors;
  },
  focusClassName: "forman-focus",
  respectReducedMotion: true,
  spacing: { md: "1rem", lg: "1.5rem" },
  primaryColor: "violet",
  defaultRadius: "md",
  fontFamily: "Arial, Helvetica, sans-serif",
  headings: { fontFamily: "Arial, Helvetica, sans-serif", fontWeight: "600" },
  components: {
    Alert: Alert.extend({
      styles: {
        title: { fontSize: "var(--mantine-font-size-sm)", fontWeight: 600 },
        message: { fontSize: "var(--mantine-font-size-sm)" },
        icon: { marginInlineEnd: "var(--mantine-spacing-sm)" },
      },
    }),
    ActionIcon: ActionIcon.extend({
      styles: (_theme, props) => ({
        root: props.variant === "subtle" && props.disabled
          ? { backgroundColor: "transparent", borderColor: "transparent" }
          : {},
      }),
    }),
    Anchor: { defaultProps: { underline: "always" } },
    Modal: {
      defaultProps: { padding: "md", closeButtonProps: { "aria-label": "Close dialog" } },
      styles: {
        title: {
          fontSize: "var(--mantine-font-size-xl)",
          fontWeight: 600,
          lineHeight: 1.3,
          overflowWrap: "anywhere",
        },
        body: { fontSize: "var(--mantine-font-size-sm)" },
      },
    },
    Drawer: {
      defaultProps: { closeButtonProps: { "aria-label": "Close navigation" } },
    },
    Button: { defaultProps: { size: "sm" } },
    TextInput: { defaultProps: { size: "sm" } },
    Select: {
      defaultProps: { size: "sm", withCheckIcon: false },
      classNames: { option: classes.option },
    },
    Menu: { classNames: { item: classes.menuItem } },
    Paper: { defaultProps: { radius: "md" } },
  },
});

/** Keep the existing preference as the single source of truth during migration. */
export function AdminTheme({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <MantineProvider
      theme={adminTheme}
      cssVariablesResolver={(theme) => ({
        variables: {},
        light: { "--mantine-color-dimmed": theme.colors.gray[7] },
        dark: { "--mantine-color-dimmed": theme.colors.dark[1] },
      })}
      forceColorScheme={resolvedTheme === "dark" ? "dark" : "light"}
    >
      {children}
    </MantineProvider>
  );
}
