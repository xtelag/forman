"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import { TriangleAlert } from "lucide-react";

import type { AdminResource } from "@/client/use-admin-resource";
import { Button, Group, Text } from "@mantine/core";
import { useConnectionStatus } from "@/client/connection-status";
import { LocalDateTime } from "@/components/patterns/local-date-time";

type ResourceFreshness = Pick<
  AdminResource<unknown>,
  "lastUpdatedAt" | "refresh" | "refreshing" | "stale"
>;

export function AdminResourceNotice({
  resource,
  resources = [],
}: {
  resource?: ResourceFreshness;
  resources?: ResourceFreshness[];
}) {
  const connection = useConnectionStatus();
  const stale = (resource ? [resource, ...resources] : resources).filter(
    (entry) => entry.stale,
  );
  if (stale.length === 0) return null;
  const successfulTimes = stale.flatMap((entry) =>
    entry.lastUpdatedAt === undefined ? [] : [entry.lastUpdatedAt],
  );
  const lastSuccess = successfulTimes.length
    ? new Date(Math.min(...successfulTimes)).toISOString()
    : undefined;
  const refreshing = stale.some((entry) => entry.refreshing);
  // An unreachable server is announced once by the application banner.
  if (!connection.reachable) return null;

  return (
    <Alert
      color="yellow"
      variant="light"
      role="alert"
      data-variant="warning"
      py="xs"
      icon={<TriangleAlert size={16} aria-hidden="true" />}
    >
      <Group gap="sm" justify="space-between" wrap="wrap">
        <Text size="sm">
          Couldn&apos;t refresh this page.
          {lastSuccess ? (
            <>
              {" "}
              Showing data from <LocalDateTime value={lastSuccess} />.
            </>
          ) : null}
        </Text>
        <Button
          disabled={refreshing}
          onClick={() => stale.forEach((entry) => entry.refresh())}
          size="compact-sm"
          type="button"
          variant="default"
        >
          {refreshing ? "Retrying…" : "Try again"}
        </Button>
      </Group>
    </Alert>
  );
}
