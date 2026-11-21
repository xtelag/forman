"use client";

import { RowNavigationItems } from "@/components/patterns/row-navigation-items";
import { Menu, Text } from "@mantine/core";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteSubmission } from "@/client/admin-api/submissions";
import type { AdminSubmission } from "@/shared/contracts/admin";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
export function SubmissionRowActions({
  submission,
  onDeleted,
  returnTo = "/app/submissions",
}: {
  submission: AdminSubmission;
  onDeleted?: () => void;
  returnTo?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const deletable =
    submission.state === undefined || submission.state === "completed";
  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await deleteSubmission(submission.id);
      setOpen(false);
      toast.success("Submission deleted");
      onDeleted?.();
    } catch {
      setError("The Submission could not be deleted. Try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <RowActionsMenu
        label={"Actions for Submission " + submission.id}
        triggerRef={triggerRef}
        disabled={pending}
      >
        <RowNavigationItems
          items={[
            {
              label: "Open Submission",
              href:
                "/app/submissions/" +
                encodeURIComponent(submission.id) +
                "?returnTo=" +
                encodeURIComponent(returnTo),
            },
            {
              label: "Open Source",
              href:
                "/app/sources/" + encodeURIComponent(submission.sourcePublicId),
            },
          ]}
        />

        {onDeleted ? (
          <>
            <Menu.Divider />
            <Menu.Item
              color="red"
              disabled={!deletable}
              onClick={() => {
                setError("");
                setOpen(true);
              }}
            >
              Delete permanently
            </Menu.Item>
            {!deletable ? (
              <Text size="xs" c="dimmed" px="sm" pb={6}>
                Only completed Submissions can be deleted.
              </Text>
            ) : null}
          </>
        ) : null}
      </RowActionsMenu>
      <ConfirmDialog
        opened={open}
        title="Delete Submission?"
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        returnFocusTo={triggerRef}
        onCancel={() => setOpen(false)}
        onConfirm={() => void remove()}
      >
        This action cannot be undone.
      </ConfirmDialog>
    </>
  );
}
