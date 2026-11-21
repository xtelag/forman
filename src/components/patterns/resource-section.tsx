"use client";
import { Box, Group, Paper, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

type ResourceSectionProperties = {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: ReactNode;
  id?: string;
  title: ReactNode;
  /** The enclosing tab already names this single section. */
  hideTitle?: boolean;
};
export function ResourceSection({
  actions,
  children,
  className,
  contentClassName,
  description,
  id,
  title,
  hideTitle = false,
}: ResourceSectionProperties) {
  return (
    <Paper
      component="section"
      withBorder
      className={className}
      id={id}
      data-slot="resource-section"
      aria-label={hideTitle && typeof title === "string" ? title : undefined}
    >
      {!hideTitle || description || actions ? (
        <Group
          component="header"
          align="flex-start"
          justify="space-between"
          gap="sm"
          p="md"
          style={{
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Stack gap={4} miw={0} flex="1 1 12rem">
            {!hideTitle ? (
              <Text component="h2" fw={600}>
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions ? <Group gap="xs">{actions}</Group> : null}
        </Group>
      ) : null}
      <Box p="md" className={contentClassName}>
        {children}
      </Box>
    </Paper>
  );
}
