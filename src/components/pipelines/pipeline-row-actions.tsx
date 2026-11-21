"use client";

import { PipelineRelatedMenuItems } from "@/components/patterns/related-menu-items";
import { Menu, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deletePipeline,
  updatePipelineConfiguration,
  type AdminPipeline,
} from "@/client/admin-api/pipelines";
import { AdminApiError } from "@/client/admin-api/client";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";

export function PipelineRowActions({
  pipeline,
  onChanged,
  detail = false,
  onStateChanged,
  onDeleted,
}: {
  pipeline: AdminPipeline;
  onChanged: () => void;
  detail?: boolean;
  onStateChanged?: (enabled: boolean) => void;
  onDeleted?: () => void;
}) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await updatePipelineConfiguration(pipeline.id, {
        enabled: !pipeline.enabled,
      });
      if (!alive.current) return;
      toast.success(
        pipeline.enabled ? "Pipeline disabled" : "Pipeline enabled",
      );
      onStateChanged?.(!pipeline.enabled);
      onChanged();
    } catch {
      if (!alive.current) return;
      toast.error("The Pipeline state could not be updated. Try again.");
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await deletePipeline(pipeline.id);
      if (!alive.current) return;
      setOpen(false);
      toast.success("Pipeline deleted");
      (onDeleted ?? onChanged)();
    } catch (error) {
      if (!alive.current) return;
      setError(
        error instanceof AdminApiError && error.status === 409
          ? error.message
          : "The Pipeline could not be deleted. Try again.",
      );
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <>
      <RowActionsMenu
        detail={detail}
        label={detail ? "Pipeline actions" : "Actions for " + pipeline.name}
        disabled={pending}
        triggerRef={triggerRef}
      >
        <PipelineRelatedMenuItems
          id={pipeline.id}
          sourceId={pipeline.sourceId}
          sourcePublicId={pipeline.sourcePublicId}
          detail={detail}
        />
        <Menu.Divider />
        <Menu.Item disabled={pending} onClick={() => void toggle()}>
          {pipeline.enabled ? "Disable" : "Enable"}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          disabled={pipeline.enabled || pending}
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          Delete permanently
        </Menu.Item>
        {pipeline.enabled ? (
          <Text size="xs" c="dimmed" px="sm" pb={6}>
            Disable the Pipeline to delete it.
          </Text>
        ) : null}
      </RowActionsMenu>
      <ConfirmDialog
        opened={open}
        title="Delete Pipeline?"
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        returnFocusTo={triggerRef}
        onCancel={() => setOpen(false)}
        onConfirm={() => void remove()}
      >
        {pipeline.name} and its Actions will be deleted. Existing Pipeline Runs
        stay in history. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
