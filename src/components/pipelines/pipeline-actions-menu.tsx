"use client";
import { PipelineRowActions } from "./pipeline-row-actions";
import type { AdminPipeline } from "@/client/admin-api/pipelines";
import { discardUnsavedChanges } from "@/client/use-unsaved-changes";
import { useAppNavigation } from "@/components/layout/app-link";
export function PipelineActionsMenu({
  pipeline,
  onStateChanged,
}: {
  pipeline: AdminPipeline;
  onStateChanged: (enabled: boolean) => void;
}) {
  const navigation = useAppNavigation();
  return (
    <PipelineRowActions
      detail
      pipeline={pipeline}
      onChanged={() => {}}
      onStateChanged={onStateChanged}
      onDeleted={() => {
        discardUnsavedChanges();
        navigation.go("/app/pipelines");
      }}
    />
  );
}
