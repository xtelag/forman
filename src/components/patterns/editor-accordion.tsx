"use client";
import classes from "./editor-accordion.module.css";
import { Accordion, Group, Text } from "@mantine/core";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SectionsContext = createContext<{
  values: string[];
  reveal: (value: string) => void;
}>({ values: [], reveal: () => {} });

export function EditorAccordion({
  value,
  onChange,
  children,
  order = 2,
  chevronPosition = "right",
  compact = false,
}: {
  order?: 2 | 3;
  chevronPosition?: "left" | "right";
  compact?: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  children: ReactNode;
}) {
  return (
    <SectionsContext.Provider
      value={{
        values: value,
        reveal: (section) => {
          if (!value.includes(section)) onChange([...value, section]);
        },
      }}
    >
      <Accordion
        chevronPosition={chevronPosition}
        multiple
        variant="separated"
        radius="md"
        order={order}
        value={value.map(encodeURIComponent)}
        onChange={(values) => onChange(values.map(decodeURIComponent))}
        styles={{
          root: {
            display: "flex",
            flexDirection: "column",
            gap: "var(--mantine-spacing-md)",
          },
          item: { margin: 0 },
          itemTitle: { minWidth: 0, flex: 1 },
          label: { minWidth: 0, overflowWrap: "anywhere" },
          content: { paddingTop: compact ? 0 : "var(--mantine-spacing-md)" },
        }}
      >
        {children}
      </Accordion>
    </SectionsContext.Provider>
  );
}

/** Preserve visited panels and reveal validation/deep links, as in other editors. */
export function EditorSection({
  children,
  title,
  header,
  description,
  value,
  forceMount,
  actions,
}: {
  actions?: ReactNode;
  children: ReactNode;
  title: string;
  header?: ReactNode;
  description?: ReactNode;
  value: string;
  forceMount?: true;
}) {
  const { values, reveal } = useContext(SectionsContext);
  const opened = values.includes(value);
  const [visited, setVisited] = useState(false);
  if (opened && !visited) setVisited(true);
  const element = useRef<HTMLDivElement>(null);
  const revealRef = useRef(reveal);
  useLayoutEffect(() => {
    revealRef.current = reveal;
  });
  const id = value.replace(/\s+/g, "-");

  useEffect(() => {
    const item = element.current;
    if (!item) return;
    const revealHash = () => {
      let hash: string;
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!hash) return;
      const target = document.getElementById(hash);
      if (hash !== value && hash !== id && (!target || !item.contains(target)))
        return;
      revealRef.current(value);
      requestAnimationFrame(() =>
        (target ?? item).scrollIntoView?.({ block: "start" }),
      );
    };
    let previous = new Map<Element, string>();
    const revealErrors = () => {
      const next = new Map<Element, string>();
      let changed = false;
      item
        .querySelectorAll('[role="alert"], [aria-invalid="true"]')
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
            changed = true;
        });
      previous = next;
      if (changed) revealRef.current(value);
    };
    revealHash();
    revealErrors();
    const observer = new MutationObserver(revealErrors);
    observer.observe(item, {
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
  }, [id, value]);

  return (
    <Accordion.Item
      value={encodeURIComponent(value)}
      id={id}
      ref={element}
      data-slot="resource-section"
      onInvalidCapture={() => revealRef.current(value)}
    >
      {actions ? (
        <Group gap={0} wrap="nowrap" align="center" className={header ? classes.customHeader : undefined}>
          {" "}
          <Accordion.Control
            classNames={header ? { chevron: classes.chevron } : undefined}
            data-slot="accordion-trigger"
            style={actions ? { flex: 1, minWidth: 0 } : undefined}
          >
            {header ?? <Text component="span" fw={600}>{title}</Text>}
            {description ? (
              <Text component="span" display="block" size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Accordion.Control>
          <span className={header ? classes.actions : undefined}>{actions}</span>
        </Group>
      ) : (
        <Accordion.Control
          data-slot="accordion-trigger"
          style={actions ? { flex: 1, minWidth: 0 } : undefined}
        >
          {header ?? <Text component="span" fw={600}>{title}</Text>}
          {description ? (
            <Text component="span" display="block" size="sm" c="dimmed">
              {description}
            </Text>
          ) : null}
        </Accordion.Control>
      )}
      <Accordion.Panel
        keepMounted={forceMount || visited || opened}
        keepMountedMode="display-none"
      >
        {children}
      </Accordion.Panel>
    </Accordion.Item>
  );
}
