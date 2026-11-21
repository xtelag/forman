"use client";

import { Button, Group } from "@mantine/core";
import { X } from "lucide-react";

export type ActiveFilterChip = {
  /** Stable key. */
  id: string;
  /** Visible text, written as "Field: Value", for example "Status: Active". */
  label: string;
  onRemove: () => void;
};

/**
 * Filters that arrive from a link (for example a Dashboard card) and have no
 * control of their own in the filter panel. The whole chip is one button that
 * removes its filter, so it works with keyboard and screen readers.
 */
export function ActiveFilterChips({ chips }: { chips: ActiveFilterChip[] }) {
  if (!chips.length) return null;
  return (
    <Group role="group" aria-label="Active filters" gap="xs">
      {chips.map((chip) => (
        <Button
          key={chip.id}
          type="button"
          size="compact-sm"
          variant="light"
          color="gray"
          radius="xl"
          maw="100%"
          aria-label={`Remove filter ${chip.label}`}
          rightSection={<X size={14} aria-hidden />}
          onClick={chip.onRemove}
        >
          {chip.label}
        </Button>
      ))}
    </Group>
  );
}
