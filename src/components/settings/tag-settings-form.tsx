"use client";
import { FormGroup, formWidth } from "@/components/patterns/form-layout";
import { PageState } from "@/components/patterns/page-state";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Box } from "@mantine/core";
import {
  ActionIcon,
  Badge,
  Button,
  ColorSwatch,
  Flex,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { tagAppearance, tagColor } from "@/components/patterns/tag-color";

import { useUnsavedChanges } from "@/client/use-unsaved-changes";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createTag,
  deleteTag,
  getTagUsage,
  listTags,
} from "@/client/admin-api/sources";
import { tagColorOptions } from "@/components/sources/source-tags-configuration";
import type { AdminTag } from "@/shared/contracts/admin";

export function TagSettingsForm() {
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState<AdminTag["color"]>("violet");
  const [deleting, setDeleting] = useState<AdminTag | null>(null);
  const [usage, setUsage] = useState<Awaited<
    ReturnType<typeof getTagUsage>
  > | null>(null);
  const [pending, setPending] = useState(false);

  useUnsavedChanges(Boolean(name.trim()));

  useEffect(() => {
    void listTags()
      .then(setTags)
      .catch(() => toast.error("Tags could not be loaded."));
  }, []);
  async function add() {
    if (!name.trim()) return;
    setPending(true);
    try {
      const tag = await createTag({ color, name });
      setTags((current) =>
        [...current, tag].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setName("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The tag could not be created.",
      );
    } finally {
      setPending(false);
    }
  }
  async function openDelete(tag: AdminTag) {
    setDeleting(tag);
    setUsage(null);
    try {
      setUsage(await getTagUsage(tag.id));
    } catch {
      toast.error("Tag usage could not be loaded.");
      setDeleting(null);
    }
  }
  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      await deleteTag(deleting.id);
      setTags((current) => current.filter((tag) => tag.id !== deleting.id));
      toast.success(`Tag “${deleting.name}” deleted`);
      setDeleting(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The tag could not be deleted.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Stack gap="lg" maw={formWidth}>
      <FormGroup legend="New tag">
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Stack gap="md">
            <Flex direction={{ base: "column", sm: "row" }} align="end" gap="md">
            <TextInput
              w="100%"
              style={{ flex: 1 }}
              label="Name"
              id="new-tag-name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              disabled={pending}
            />
            <Group align="end" wrap="nowrap" w={{ base: "100%", sm: 300 }}>
              <Select
                label="Color"
                value={color}
                onChange={(value) => {
                  if (value) setColor(value as AdminTag["color"]);
                }}
                allowDeselect={false}
                data={tagColorOptions}
                disabled={pending}
                maxDropdownHeight={240}
                style={{ flex: 1, minWidth: 0 }}
                leftSection={
                  <ColorSwatch
                    color={"var(--mantine-color-" + tagColor(color) + "-3)"}
                    size={14}
                  />
                }
                renderOption={({ option }) => (
                  <Group gap="xs" wrap="nowrap">
                    <ColorSwatch
                      size={14}
                      color={
                        "var(--mantine-color-" +
                        tagColor(option.value as AdminTag["color"]) +
                        "-3)"
                      }
                    />
                    {option.label}
                  </Group>
                )}
              />
              <Button
                type="submit"
                disabled={pending || !name.trim()}
                leftSection={<Plus size={16} />}
              >
                Add tag
              </Button>
            </Group>
            </Flex>
          </Stack>
        </Box>
      </FormGroup>
      <FormGroup legend="Existing tags">
          {tags.length ? (
            <Group gap="xs">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  data-testid={"tag-chip-" + tag.id}
                  styles={{ root: tagAppearance(tag.color) }}
                  variant="light"
                  color={tagColor(tag.color)}
                  size="lg"
                  radius="sm"
                  tt="none"
                  maw="100%"
                  rightSection={
                    <Tooltip label={"Delete tag " + tag.name}>
                      <ActionIcon
                        aria-label={"Delete tag " + tag.name}
                        color={tagColor(tag.color)}
                        styles={{ root: { color: "var(--mantine-color-gray-9)" } }}
                        variant="subtle"
                        size="xs"
                        disabled={pending}
                        onClick={() => void openDelete(tag)}
                      >
                        <Trash2 size={12} />
                      </ActionIcon>
                    </Tooltip>
                  }
                >
                  <Text component="span" size="sm" truncate>
                    {tag.name}
                  </Text>
                </Badge>
              ))}
            </Group>
          ) : (
            <PageState embedded variant="empty" title="No tags yet" />
          )}
      </FormGroup>
      <ConfirmDialog
        opened={deleting !== null}
        title={"Delete tag “" + deleting?.name + "”?"}
        confirmLabel="Delete tag"
        pendingLabel="Deleting…"
        confirmDisabled={usage === null}
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      >
        {usage === null
          ? "Checking assignments…"
          : usage.assignedSourceCount === 0
            ? "This tag is not assigned to any Sources."
            : "This removes the tag from " +
              usage.assignedSourceCount +
              " " +
              (usage.assignedSourceCount === 1 ? "Source" : "Sources") +
              " (" +
              usage.assignedSourceNames.join(", ") +
              ")."}
      </ConfirmDialog>
    </Stack>
  );
}
