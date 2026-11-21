"use client";
import { AppLink } from "@/components/layout/app-link";
import { PageState } from "@/components/patterns/page-state";

import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  listTags,
  saveSourceSettingsSection,
} from "@/client/admin-api/sources";
import { Badge, Button, ColorSwatch, Group, Stack, Text } from "@mantine/core";
import { tagAppearance, tagColor } from "@/components/patterns/tag-color";
import type { AdminTag } from "@/shared/contracts/admin";

export const tagColorOptions: Array<{
  label: string;
  value: AdminTag["color"];
}> = [
  { label: "Rose", value: "rose" },
  { label: "Coral", value: "coral" },
  { label: "Peach", value: "peach" },
  { label: "Amber", value: "amber" },
  { label: "Lemon", value: "lemon" },
  { label: "Mint", value: "mint" },
  { label: "Emerald", value: "emerald" },
  { label: "Teal", value: "teal" },
  { label: "Sky", value: "sky" },
  { label: "Blue", value: "blue" },
  { label: "Indigo", value: "indigo" },
  { label: "Violet", value: "violet" },
  { label: "Fuchsia", value: "fuchsia" },
];
const emptyTags: AdminTag[] = [];

export function TagColorSwatch({ color }: { color: AdminTag["color"] }) {
  return (
    <ColorSwatch
      aria-hidden="true"
      size={12}
      color={"var(--mantine-color-" + tagColor(color) + "-3)"}
      data-testid={"tag-color-swatch-" + color}
    />
  );
}

export function TagBadge({
  compact = false,
  action,
  className,
  tag,
}: {
  compact?: boolean;
  action?: ReactNode;
  className?: string;
  tag: AdminTag;
}) {
  return (
    <Badge
      className={className}
      styles={{ root: tagAppearance(tag.color) }}
      color={tagColor(tag.color)}
      variant="light"
      radius="sm"
      size={compact ? "md" : "lg"}
      miw={compact ? 0 : undefined}
      flex={compact ? "0 1 auto" : undefined}
      tt="none"
      fw={500}
      maw="100%"
      title={tag.name}
      rightSection={action}
    >
      {tag.name}
    </Badge>
  );
}

export function SourceTagsConfiguration({
  sourceId,
  initialTags,
}: {
  sourceId: string;
  initialTags?: AdminTag[];
}) {
  const [available, setAvailable] = useState<AdminTag[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const tags = initialTags ?? emptyTags;
  const initialSelected = tags.map((tag) => tag.id);
  const selectionSource = initialSelected.join("\u0000");
  const [selection, setSelection] = useState({
    ids: initialSelected,
    source: selectionSource,
  });
  const selected =
    selection.source === selectionSource ? selection.ids : initialSelected;
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void listTags()
      .then((tags) => { if (active) setAvailable(tags); })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [loadAttempt]);

  async function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    setSelection({ ids: next, source: selectionSource });
    setPending(true);
    try {
      await saveSourceSettingsSection(sourceId, "tags", { tagIds: next });
    } catch (error) {
      setSelection({ ids: selected, source: selectionSource });
      toast.error(
        error instanceof Error ? error.message : "The tags could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }
  if (loadFailed) {
    return (
      <PageState embedded variant="error" title="Tags could not be loaded" action={
        <Button variant="default" onClick={() => { setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }}>
          Retry
        </Button>
      } />
    );
  }
  if (available === null) {
    return <PageState embedded variant="loading" title="Loading tags" />;
  }
  if (!available.length) {
    return (
      <PageState embedded variant="empty" title="No tags available" action={
        <Button component={AppLink} href="/app/settings#tags" variant="default">Manage tags</Button>
      } />
    );
  }
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Changes apply immediately.
      </Text>
      <Group gap="xs">
        {available.map((tag) => (
          <Button
            key={tag.id}
            aria-pressed={selected.includes(tag.id)}
            styles={{ root: selected.includes(tag.id) ? tagAppearance(tag.color, true) : undefined }}
            color={tagColor(tag.color)}
            variant={selected.includes(tag.id) ? "light" : "default"}
            disabled={pending}
            onClick={() => void toggle(tag.id)}
          >
            {tag.name}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}
