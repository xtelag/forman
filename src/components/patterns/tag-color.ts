import type { AdminTag } from "@/shared/contracts/admin";
const colors: Record<AdminTag["color"], string> = {
  rose: "pink",
  coral: "red",
  peach: "orange",
  amber: "yellow",
  lemon: "lime",
  mint: "teal",
  emerald: "green",
  teal: "teal",
  sky: "cyan",
  blue: "blue",
  indigo: "indigo",
  violet: "violet",
  fuchsia: "grape",
};
export function tagColor(color: AdminTag["color"]) {
  return colors[color];
}

/** Opaque palette shades keep tag identity and text contrast stable in both themes. */
export function tagAppearance(color: AdminTag["color"], selected = false) {
  const palette = tagColor(color);
  return {
    backgroundColor: "var(--mantine-color-" + palette + "-" + (selected ? 3 : 1) + ")",
    color: "var(--mantine-color-gray-9)",
    borderColor: selected ? "var(--mantine-color-" + palette + "-7)" : "transparent",
  };
}
