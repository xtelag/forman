"use client";
import { Fieldset, SimpleGrid, rem, type FieldsetProps } from "@mantine/core";
import type { ReactNode } from "react";

export const formWidth = 792;
export const formContentWidth = formWidth - 32;

export function FormFields({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid type="container" cols={{ base: 1, "40em": 2 }} spacing="md" verticalSpacing="md">
      {children}
    </SimpleGrid>
  );
}

/** Preserve fieldset semantics and native disabling, including inside Actions. */
export function FormGroup({ children, embedded = false, ...props }: FieldsetProps & { embedded?: boolean }) {
  return (
    <Fieldset
      p={embedded ? 0 : "md"}
      miw={0}
      {...props}
      styles={{
        root: embedded ? { border: 0, background: "transparent" } : undefined,
        legend: { fontSize: "var(--mantine-font-size-md)", fontWeight: 600, paddingInline: embedded ? 0 : rem(8) },
      }}
    >
      {children}
    </Fieldset>
  );
}
