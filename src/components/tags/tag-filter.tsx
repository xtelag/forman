"use client";
import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import { FilterX } from "lucide-react";
import { PageState } from "@/components/patterns/page-state";
import { tagAppearance, tagColor } from "@/components/patterns/tag-color";
import type { AdminTag } from "@/shared/contracts/admin";
export function matchesSelectedTags(
  tags: AdminTag[] | undefined,
  selectedTagIds: string[],
) {
  return (
    selectedTagIds.length === 0 ||
    Boolean(tags?.some((tag) => selectedTagIds.includes(tag.id)))
  );
}

export function TagFilter({
  onSelectedTagIdsChange,
  selectedTagIds,
  showClearAction = false,
  tags,
}: {
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  selectedTagIds: string[];
  showClearAction?: boolean;
  tags: AdminTag[];
}) {
  if (!tags.length) return null;
  const uniqueTags = Array.from(
    new Map(tags.map((tag) => [tag.id, tag])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Group role="group" aria-label="Filter by tags" gap="xs">
      {showClearAction ? (
        <Tooltip label="Clear tag filters">
          <ActionIcon
            aria-label="Clear tag filters"
            disabled={!selectedTagIds.length}
            onClick={() => onSelectedTagIdsChange([])}
            variant="subtle"
            color="gray"
            size={28}
          >
            <FilterX size={17} />
          </ActionIcon>
        </Tooltip>
      ) : null}
      {uniqueTags.map((tag) => (
        <Button
          key={tag.id}
          styles={{ root: tagAppearance(tag.color, selectedTagIds.includes(tag.id)) }}
          color={tagColor(tag.color)}
          variant={selectedTagIds.includes(tag.id) ? "filled" : "light"}
          size="compact-sm"
          h={28}
          px={12}
          maw="100%"
          aria-pressed={selectedTagIds.includes(tag.id)}
          onClick={() =>
            onSelectedTagIdsChange(
              selectedTagIds.includes(tag.id)
                ? selectedTagIds.filter((id) => id !== tag.id)
                : [...selectedTagIds, tag.id],
            )
          }
        >
          {tag.name}
        </Button>
      ))}
    </Group>
  );
}
export function TagFilterEmptyState() {
  return (
    <PageState title="No records match the selected tags." variant="empty">
      Change or clear the selected tags to see records.
    </PageState>
  );
}
