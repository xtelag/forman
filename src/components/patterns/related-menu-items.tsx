"use client";
import { Menu } from "@mantine/core";
import { RowNavigationItems } from "./row-navigation-items";
const enc = encodeURIComponent;
export function SourceRelatedMenuItems({
  source, pipelineCount, pageCount,
}: {
  source: { id: string; type: string; enabled: boolean; fieldDefinitionMode?: string | null; fieldDefinitionSource?: string | null };
  pipelineCount: number;
  pageCount: number;
}) {
  const id = enc(source.id);
  const formReason = source.type === "m2m"
    ? "Built-in Forms require a One-shot or Session Source."
    : !source.fieldDefinitionMode || !source.fieldDefinitionSource?.trim()
      ? "Configure Source fields first."
      : null;
  return (
    <>
      <RowNavigationItems items={[
        { label: "View Submissions", href: "/app/submissions?sourceId=" + id },
        pipelineCount > 0 && { label: "View Pipelines", href: "/app/pipelines?sourceId=" + id },
        pageCount > 0 && { label: "View Built-in Forms", href: "/app/pages?sourceId=" + id },
      ]} />
      <Menu.Divider />
      {source.enabled ? (
        <RowNavigationItems items={[{ label: "Create Pipeline", href: "/app/pipelines?create=1&sourceId=" + id }]} />
      ) : (
        <>
          <Menu.Item disabled>Create Pipeline</Menu.Item>
          <Menu.Label>Activate the Source first.</Menu.Label>
        </>
      )}
      {formReason ? (
        <>
          <Menu.Item disabled>Create Built-in Form</Menu.Item>
          <Menu.Label style={{ whiteSpace: "normal" }}>{formReason}</Menu.Label>
        </>
      ) : (
        <RowNavigationItems items={[{ label: "Create Built-in Form", href: "/app/pages?create=1&sourceId=" + id }]} />
      )}
    </>
  );
}
export function PipelineRelatedMenuItems({
  id,
  sourceId,
  sourcePublicId,
  detail = false,
}: {
  id: string;
  sourceId: string;
  sourcePublicId: string;
  detail?: boolean;
}) {
  return (
    <>
      <RowNavigationItems
        items={[
          !detail && {
            label: "Open Pipeline",
            href: "/app/pipelines/" + enc(id),
          },
          {
            label: "View Pipeline Runs",
            href: "/app/pipelines/" + enc(id) + "/runs",
          },
          {
            label: "View Waiting Callbacks",
            href: "/app/callbacks?pipelineId=" + enc(id),
          },
          {
            label: "View Source Submissions",
            href: "/app/submissions?sourceId=" + enc(sourceId),
          },
        ]}
      />
      <Menu.Divider />
      <RowNavigationItems
        items={[
          !detail && {
            label: "View Actions",
            href: "/app/pipelines/" + enc(id) + "#actions",
          },
          { label: "Open Source", href: "/app/sources/" + enc(sourcePublicId) },
        ]}
      />
    </>
  );
}
