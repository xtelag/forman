"use client";
import { Accordion } from "@mantine/core";
import type { ReactNode } from "react";

export function DetailDisclosure({ children, title = "Details" }: { children: ReactNode; title?: string }) {
  return (
    <Accordion variant="separated">
      <Accordion.Item value="details">
        <Accordion.Control>{title}</Accordion.Control>
        <Accordion.Panel>{children}</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
