"use client";
import { ScrollArea, Tabs } from "@mantine/core";
import { useEffect, useRef, type ReactNode } from "react";

/** One scrollable tab strip for Settings, resource editors and Inbox. */
export function EditorTabList({ children, label, spaced = true }: { children: ReactNode; label: string; spaced?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const revealSelected = () => {
      const selected = element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!selected) return;
      const bounds = element.getBoundingClientRect();
      const tab = selected.getBoundingClientRect();
      if (tab.left < bounds.left) element.scrollLeft -= bounds.left - tab.left;
      else if (tab.right > bounds.right) element.scrollLeft += tab.right - bounds.right;
    };
    revealSelected();
    const resize = new ResizeObserver(revealSelected);
    resize.observe(element);
    return () => resize.disconnect();
  }, [children]);
  return (
    <ScrollArea viewportRef={viewport} type="auto" scrollbars="x" offsetScrollbars="x" mb={spaced ? "lg" : 0}>
      <Tabs.List aria-label={label} w="max-content" miw="100%">{children}</Tabs.List>
    </ScrollArea>
  );
}
