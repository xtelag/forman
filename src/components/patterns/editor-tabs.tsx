"use client";

import { Box, Tabs } from "@mantine/core";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formWidth } from "./form-layout";
import { EditorTabList } from "./editor-tab-list";
import { ResourceSection } from "./resource-section";
import { replaceLocationHash } from "@/client/location-hash";

type Section = { value: string; label: string };
const ActiveTab = createContext("");
const sectionId = (value: string) => value.replace(/\s+/g, "-");

/** Selection is scoped to the resource; the URL hash keeps it across reloads. */
export function useEditorTabState(scope: string, initial: string) {
  const [state, setState] = useState({ scope, value: initial });
  if (state.scope !== scope) setState({ scope, value: initial });
  return [
    state.scope === scope ? state.value : initial,
    (value: string) => setState({ scope, value }),
  ] as const;
}

export function EditorTabs({
  value,
  onChange,
  sections,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  sections: readonly Section[];
  label: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const select = (next: string) => {
    onChange(next);
    replaceLocationHash(sectionId(next));
  };
  const current = useRef({ value, onChange });
  useLayoutEffect(() => {
    current.current = { value, onChange };
  });
  const panelFor = (element: Element) =>
    element.closest<HTMLElement>("[data-editor-tab]");
  const revealField = (element: HTMLElement, reportValidity = false) => {
    const panel = panelFor(element);
    if (!panel) return;
    current.current.onChange(panel.dataset.editorTab!);
    requestAnimationFrame(() => {
      element.focus();
      element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      if (
        reportValidity &&
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement)
      )
        element.reportValidity();
    });
  };

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const revealHash = () => {
      let hash: string;
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!hash) return;
      const section = sections.find(
        (section) =>
          section.value === hash || sectionId(section.value) === hash,
      );
      const target = document.getElementById(hash);
      const panel =
        target && element.contains(target) ? panelFor(target) : null;
      const next = section?.value ?? panel?.dataset.editorTab;
      if (!next) return;
      current.current.onChange(next);
      requestAnimationFrame(() => {
        (section
          ? document.getElementById(sectionId(next))
          : target
        )?.scrollIntoView?.({ block: "nearest" });
      });
    };
    let previous = new Map<Element, string>();
    const revealErrors = () => {
      const next = new Map<Element, string>();
      const changed: HTMLElement[] = [];
      element
        .querySelectorAll<HTMLElement>('[role="alert"], [aria-invalid="true"]')
        .forEach((node) => {
          if (
            ["warning", "info"].includes(
              node.getAttribute("data-variant") ?? "",
            )
          )
            return;
          const message = node.textContent ?? "";
          next.set(node, message);
          if (!previous.has(node) || previous.get(node) !== message)
            changed.push(node);
        });
      previous = next;
      // Shared forms can render the same save error in two panels. Prefer the active panel.
      const invalid = changed.filter(
        (node) => node.getAttribute("aria-invalid") === "true",
      );
      const candidates = invalid.length ? invalid : changed;
      const target =
        candidates.find(
          (node) => panelFor(node)?.dataset.editorTab === current.current.value,
        ) ?? candidates[0];
      const nextValue = target && panelFor(target)?.dataset.editorTab;
      if (nextValue && nextValue !== current.current.value)
        current.current.onChange(nextValue);
    };
    revealErrors();
    revealHash();
    const observer = new MutationObserver(revealErrors);
    observer.observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-invalid", "role"],
    });
    window.addEventListener("hashchange", revealHash);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", revealHash);
    };
  }, [sections]);

  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <ActiveTab.Provider value={value}>
      <Tabs
        ref={root}
        value={encodeURIComponent(value)}
        onChange={(next) => {
          if (next) select(decodeURIComponent(next));
        }}
        keepMounted
        onInvalidCapture={(event) => {
          const target = event.target as HTMLElement;
          const panel = panelFor(target);
          if (!panel || panel.dataset.editorTab === value) return;
          event.preventDefault();
          revealField(target, true);
        }}
        onSubmitCapture={(event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          const invalid = form.querySelector<HTMLElement>(
            "input:invalid, textarea:invalid, select:invalid",
          );
          if (!invalid) return;
          event.preventDefault();
          event.stopPropagation();
          revealField(invalid, true);
        }}
      >
        <EditorTabList label={label}>
          {sections.map((section) => (
            <Tabs.Tab
              key={section.value}
              value={encodeURIComponent(section.value)}
            >
              {section.label}
            </Tabs.Tab>
          ))}
        </EditorTabList>
        {children}
      </Tabs>
    </ActiveTab.Provider>
  );
}

/** Keep drafts alive after the first visit; configuration forms can mount immediately. */
export function EditorTabPanel({
  value,
  title,
  description,
  forceMount,
  framed = true,
  wide = false,
  children,
}: {
  value: string;
  title: string;
  description?: ReactNode;
  forceMount?: true;
  framed?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const active = useContext(ActiveTab) === value;
  const [visited, setVisited] = useState(false);
  if (active && !visited) setVisited(true);
  return (
    <Tabs.Panel value={encodeURIComponent(value)} data-editor-tab={value}>
      <Box id={sectionId(value)} maw={wide ? undefined : formWidth} miw={0}>
        {forceMount || visited || active ? (
          framed ? <ResourceSection title={title} description={description} hideTitle>
            {children}
          </ResourceSection> : children
        ) : null}
      </Box>
    </Tabs.Panel>
  );
}
