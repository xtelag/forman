"use client";

import { Box, Button, Group, Text } from "@mantine/core";
import { WifiOff } from "lucide-react";
import { probeServer, useConnectionStatus } from "@/client/connection-status";
import { formatDateTime } from "@/shared/format/date";

/** Time only for today, full ISO date otherwise. */
function since(value: number) {
  const formatted = formatDateTime(new Date(value));
  const today = formatDateTime(new Date()).slice(0, 10);
  return formatted.startsWith(today) ? formatted.slice(11) : formatted;
}

/**
 * One application-wide notice while the server is unreachable. Pages keep
 * their data; navigation waits until the server answers again.
 */
export function ConnectionBanner() {
  const { lastReachableAt, reachable, retrying } = useConnectionStatus();
  if (reachable) return null;
  return (
    <Box
      role="alert"
      data-slot="connection-banner"
      px={{ base: "md", sm: "lg" }}
      py={6}
      bg="var(--mantine-color-body)"
      pos="sticky"
      top="var(--app-shell-header-height, 64px)"
      style={{
        zIndex: 20,
        borderBottom: "1px solid var(--mantine-color-default-border)",
        backgroundImage:
          "linear-gradient(var(--mantine-color-yellow-light), var(--mantine-color-yellow-light))",
      }}
    >
      <Group gap="sm" wrap="wrap" justify="space-between">
        <Group gap="xs" wrap="nowrap" miw={0}>
          <WifiOff size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <Text size="sm">
            Server is unavailable.
            {lastReachableAt
              ? ` Showing data from ${since(lastReachableAt)}.`
              : null}{" "}
            {retrying ? "Retrying…" : "Retrying automatically."}
          </Text>
        </Group>
        <Button
          size="compact-sm"
          variant="default"
          disabled={retrying}
          onClick={() => void probeServer()}
        >
          Retry now
        </Button>
      </Group>
    </Box>
  );
}
