"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useId, type ReactNode, type RefObject } from "react";

type ConfirmDialogProperties = {
  children: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel: string;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  opened: boolean;
  pending?: boolean;
  /** Button text while the confirmed request runs, for example "Deleting…". */
  pendingLabel?: string;
  /** Receives focus after closing when the opener was a menu item that no longer exists. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** Wider dialogs fit longer explanations. */
  size?: "sm" | "md" | "lg";
  title: string;
  tone?: "danger" | "default";
};

/**
 * Shared confirmation for consequential actions. Cancel receives focus, and the
 * dialog cannot be dismissed while the confirmed request is still pending.
 */
export function ConfirmDialog({
  children,
  confirmDisabled = false,
  confirmLabel,
  error,
  onCancel,
  onConfirm,
  opened,
  pending = false,
  pendingLabel,
  returnFocusTo,
  size = "md",
  title,
  tone = "danger",
}: ConfirmDialogProperties) {
  const descriptionId = useId();
  const close = () => {
    if (!pending) onCancel();
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      title={title}
      aria-describedby={descriptionId}
      centered
      size={size}
      returnFocus={!returnFocusTo}
      onExitTransitionEnd={() => returnFocusTo?.current?.focus()}
      withCloseButton={!pending}
      closeOnEscape={!pending}
      closeOnClickOutside={!pending}
    >
      <Stack gap="lg">
        <Text id={descriptionId} component="div" size="sm">
          {children}
        </Text>
        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button
            data-autofocus
            variant="default"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button
            color={tone === "danger" ? "red" : undefined}
            loading={pending && !pendingLabel}
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
