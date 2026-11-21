"use client";
import { Menu } from "@mantine/core";

import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { SourceRelatedMenuItems } from "@/components/patterns/related-menu-items";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import type { AdminSourceDetail } from "@/shared/contracts/admin";
import { toast } from "sonner";

type SourceActionsProperties = {
  deleteSource: (sourceId: string) => Promise<void>;
  source: AdminSourceDetail;
  onDeleted: () => void;
  onError: (message: string) => void;
  refresh: () => void;
  setSourceState: (sourceId: string, enabled: boolean) => Promise<unknown>;
  submissionCount: number;
  pipelineCount: number;
  pageCount: number;
};

export function SourceActions({
  deleteSource,
  source,
  onDeleted,
  onError,
  refresh,
  setSourceState,
  submissionCount,
  pipelineCount,
  pageCount,
}: SourceActionsProperties) {
  const [deleteError, setDeleteError] = useState("");
  const [pending, setPending] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function updateState() {
    setPending(true);
    try {
      await setSourceState(source.sourceId, !source.enabled);
      toast.success(source.enabled ? "Source deactivated" : "Source activated");
      refresh();
    } catch {
      onError("The Source state could not be updated. Try again.");
    } finally {
      setPending(false);
      setDeactivateDialogOpen(false);
    }
  }

  async function removeSource() {
    setPending(true);
    setDeleteError("");
    try {
      await deleteSource(source.sourceId);
      onDeleted();
    } catch {
      setDeleteError("The Source could not be deleted. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <RowActionsMenu
        detail
        label="Source actions"
        disabled={pending}
        triggerRef={triggerRef}
      >
        <SourceRelatedMenuItems source={source} pipelineCount={pipelineCount} pageCount={pageCount} />
        <Menu.Divider />
        <Menu.Item
          disabled={pending}
          onClick={() => {
            if (source.enabled) setDeactivateDialogOpen(true);
            else void updateState();
          }}
        >
          {source.enabled ? "Deactivate" : "Activate"}
        </Menu.Item>
        {!source.enabled ? (
          <>
            <Menu.Divider />
            <Menu.Item
              color="red"
              disabled={pending}
              onClick={() => {
                setDeleteError("");
                setDeleteDialogOpen(true);
              }}
            >
              Delete permanently
            </Menu.Item>
          </>
        ) : null}
      </RowActionsMenu>
      <ConfirmDialog
        opened={source.enabled && deactivateDialogOpen}
        title="Deactivate Source?"
        confirmLabel="Deactivate"
        pending={pending}
        returnFocusTo={triggerRef}
        onCancel={() => setDeactivateDialogOpen(false)}
        onConfirm={() => void updateState()}
      >
        Stops all Submissions until the Source is reactivated.
      </ConfirmDialog>
      <ConfirmDialog
        opened={!source.enabled && deleteDialogOpen}
        error={deleteError}
        title="Delete Source?"
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        pending={pending}
        returnFocusTo={triggerRef}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void removeSource()}
      >
        {submissionCount === 0
          ? "Permanently deletes this Source; it has no stored Submissions."
          : "Permanently deletes the Source and its " +
            submissionCount +
            " stored Submissions."}
      </ConfirmDialog>
    </>
  );
}
