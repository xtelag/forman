"use client";

import { Box, Button, Flex, Group, Text, type ButtonProps } from "@mantine/core";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { toast } from "sonner";
import classes from "./save-bar.module.css";

type SaveBarProperties = {
  /** Extra controls placed before the save button, for example a test action. */
  children?: ReactNode;
  dirty: boolean;
  compact?: boolean;
  /** Disables saving beyond the dirty and pending checks, for example invalid input. */
  disabled?: boolean;
  label?: string;
  pending?: boolean;
  saveButtonProps?: ButtonProps & ComponentPropsWithoutRef<"button">;
};

/**
 * One save footer for every editor: the unsaved state on the left, the
 * primary submit action on the right. Success is announced with notifySaved.
 */
export function SaveBar({
  children,
  dirty,
  compact = false,
  disabled = false,
  label = "Save changes",
  pending = false,
  saveButtonProps,
}: SaveBarProperties) {
  return (
    <Flex
      className={compact ? classes.compact : undefined}
      direction={compact ? undefined : { base: "column-reverse", sm: "row" }}
      align={compact ? undefined : { base: "stretch", sm: "center" }}
      justify={compact ? "flex-end" : "space-between"}
      gap="sm"
      pt="xs"
      data-slot="save-bar"
    >
      <Text size="sm" aria-live="polite" display={compact ? "block" : { base: dirty ? "block" : "none", sm: "block" }}>
          <span style={{ visibility: dirty ? "visible" : "hidden" }} aria-hidden={!dirty}>
            <Box
              component="span"
              aria-hidden="true"
              display="inline-block"
              w={6}
              h={6}
              mr={8}
              bg="yellow.6"
              style={{ borderRadius: "50%", verticalAlign: "middle" }}
            />
            Unsaved changes
          </span>
      </Text>
      <Group gap="sm" ml={compact ? 0 : "auto"} justify="flex-end">
        {children}
        <Button
          type="submit"
          {...saveButtonProps}
          disabled={!dirty || pending || disabled}
          loading={pending}
        >
          {pending ? "Saving…" : label}
        </Button>
      </Group>
    </Flex>
  );
}

/** Confirms a successful save in the same place for every editor. */
export function notifySaved(message: string) {
  toast.success(message);
}
