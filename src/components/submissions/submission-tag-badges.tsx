import { Group, Text } from "@mantine/core";
import { TagBadge } from "@/components/sources/source-tags-configuration";
import type { AdminTag } from "@/shared/contracts/admin";

export function SubmissionTagBadges({ tags }: { tags: AdminTag[] }) {
  if (tags.length === 0)
    return (
      <Text component="span" c="dimmed">
        —
      </Text>
    );

  return (
    <Group gap={4}>
      {tags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} />
      ))}
    </Group>
  );
}
