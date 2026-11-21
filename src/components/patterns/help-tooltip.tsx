"use client";

import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";

/** Supplemental help only; required input guidance and consequences stay visible. */
export function HelpTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const trigger = useClickOutside<HTMLButtonElement>(() => setOpened(false));
  return (
    <Tooltip label={children} opened={opened} multiline maw={280} withArrow>
      <ActionIcon
        ref={trigger}
        type="button"
        variant="subtle"
        color="gray"
        w={{ base: 44, md: 28 }}
        h={{ base: 44, md: 28 }}
        aria-label={label}
        data-mantine-stop-propagation={opened ? "true" : undefined}
        onMouseEnter={() => setOpened(true)}
        onMouseLeave={(event) => {
          if (document.activeElement !== event.currentTarget) setOpened(false);
        }}
        onFocus={() => setOpened(true)}
        onBlur={() => setOpened(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpened(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && opened) {
            event.stopPropagation();
            setOpened(false);
          }
        }}
      >
        <Info size={14} aria-hidden="true" />
      </ActionIcon>
    </Tooltip>
  );
}

export function HelpLabel({
  label,
  help,
  htmlFor,
  required,
}: {
  label: string;
  help: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <Group component="span" display="inline-flex" gap={4} wrap="nowrap">
      {htmlFor ? (
        <label htmlFor={htmlFor}>
          {label}
          {required && (
            <Text
              component="span"
              c="var(--mantine-color-error)"
              inherit
              aria-hidden="true"
            >
              {" "}
              *
            </Text>
          )}
        </label>
      ) : (
        <span>{label}</span>
      )}
      <HelpTooltip label={`About ${label}`}>{help}</HelpTooltip>
    </Group>
  );
}
