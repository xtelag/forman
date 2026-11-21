"use client";

import { ActionIcon, Button, Group, Text, Tooltip } from "@mantine/core";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogOut, PanelLeft } from "lucide-react";
import { confirmDiscardChanges } from "@/client/use-unsaved-changes";
import { FormanWordmark } from "@/components/brand/forman-wordmark";

export function AppTopbar({
  onToggleNavigation,
  navigationOpened,
}: {
  onToggleNavigation: () => void;
  navigationOpened: boolean;
}) {
  return (
    <Group
      h="100%"
      px={{ base: 8, sm: "lg" }}
      gap={4}
      justify="space-between"
      wrap="nowrap"
    >
      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        <Tooltip
          label="Toggle navigation"
          events={{ hover: true, focus: true, touch: false }}
        >
          <ActionIcon
            aria-label="Toggle navigation"
            aria-expanded={navigationOpened}
            onClick={onToggleNavigation}
            variant="subtle"
            color="gray"
            size={44}
          >
            <PanelLeft size={20} />
          </ActionIcon>
        </Tooltip>
        <FormanWordmark />
      </Group>
      <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
        <ThemeToggle />
        <form
          action="/api/admin/v1/auth/logout"
          method="post"
          onSubmit={(event) => {
            if (!confirmDiscardChanges(true)) event.preventDefault();
          }}
        >
          <Button
            aria-label="Log out"
            type="submit"
            variant="subtle"
            color="gray"
            h={44}
            w={{ base: 44, sm: "auto" }}
            px={{ base: 0, sm: "sm" }}
          >
            <Group gap="xs" wrap="nowrap">
              <LogOut size={18} aria-hidden="true" />
              <Text component="span" inherit visibleFrom="sm">
                Log out
              </Text>
            </Group>
          </Button>
        </form>
      </Group>
    </Group>
  );
}
