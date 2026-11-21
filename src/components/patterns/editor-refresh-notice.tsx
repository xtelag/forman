"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import { Button, Group, Text } from "@mantine/core";

export function EditorRefreshNotice({
  changed,
  onReload,
}: {
  changed: boolean;
  onReload: () => void;
}) {
  if (!changed) return null;

  return (
    <Alert mb="md" color="gray" role="status" data-variant="info">
      <Group justify="space-between" gap="sm">
        <Text size="sm">Newer data is available.</Text>
        <Button
          onClick={onReload}
          size="sm"
          type="button"
          variant="default"
          styles={{
            label: { whiteSpace: "normal" },
            root: { height: "auto", minHeight: 36, paddingBlock: 8 },
          }}
        >
          Reload and discard changes
        </Button>
      </Group>
    </Alert>
  );
}
