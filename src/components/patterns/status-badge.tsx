"use client";
import { Box, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
type StatusBadgeProperties = {
  children: ReactNode;
  status: "active" | "error" | "inactive" | "success" | "warning";
  subtle?: boolean;
};
const colors = {
  active: "green",
  error: "red",
  inactive: "gray",
  success: "green",
  warning: "yellow",
};
export function StatusBadge({
  children,
  status,
  subtle = false,
}: StatusBadgeProperties) {
  return (
    <Group
      component="span"
      display="inline-flex"
      wrap="nowrap"
      gap={6}
      style={{ verticalAlign: "middle" }}
      data-status={status}
    >
      <Box
        component="span"
        aria-hidden="true"
        w={6}
        h={6}
        bg={colors[status] + ".6"}
        style={{ borderRadius: "50%", flexShrink: 0 }}
      />
      <Text component="span" size="sm" c={subtle ? "dimmed" : undefined}>
        {children}
      </Text>
    </Group>
  );
}
