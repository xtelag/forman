"use client";

import { Button, Group, Popover, ScrollArea, Stack, Text } from "@mantine/core";
import { TagBadge, TagColorSwatch } from "@/components/sources/source-tags-configuration";
import type { AdminTag } from "@/shared/contracts/admin";

// Collection tags are inherited from their Source, not assigned to each record.
export function TagList({ tags }: { tags: AdminTag[] }) {
  if (!tags.length) return <Text component="span" c="dimmed" size="sm">—</Text>;

  return (
    <Group gap={4} wrap="wrap" miw={0} role="group" aria-label="Source tags">
      {tags.slice(0, 2).map((tag) => <TagBadge key={tag.id} tag={tag} compact />)}
      {tags.length > 2 ? (
        <Popover position="bottom-end" withArrow width={280} shadow="md" trapFocus returnFocus>
          <Popover.Target>
            <Button size="compact-xs" variant="subtle" flex="0 0 auto" aria-label={`Show all ${tags.length} tags`}>
              +{tags.length - 2}
            </Button>
          </Popover.Target>
          <Popover.Dropdown tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <ScrollArea.Autosize mah={240} type="auto" offsetScrollbars>
            <Stack gap="xs">
              <Text size="xs" c="dimmed">Source tags</Text>
              {tags.map((tag) => (
                <Group key={tag.id} gap="xs" wrap="nowrap" align="flex-start">
                  <TagColorSwatch color={tag.color} />
                  <Text size="sm" miw={0} style={{ overflowWrap: "anywhere" }}>{tag.name}</Text>
                </Group>
              ))}
            </Stack>
            </ScrollArea.Autosize>
          </Popover.Dropdown>
        </Popover>
      ) : null}
    </Group>
  );
}
