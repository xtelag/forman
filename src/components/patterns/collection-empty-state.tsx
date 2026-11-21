import { Button, Group } from "@mantine/core";
import { AppLink } from "@/components/layout/app-link";
import type { ReactNode } from "react";
import { PageState } from "./page-state";

/** Relationship context is not an instruction to change filters or create data. */
export function CollectionEmptyState({
  records, sourceId, pipelineId, filtered = false, title, children, action, filteredAction, sourceHref,
}: {
  records: string;
  sourceId?: string | null;
  pipelineId?: string | null;
  filtered?: boolean;
  title?: string;
  children?: ReactNode;
  sourceHref?: string;
  action?: ReactNode;
  filteredAction?: ReactNode;
}) {
  const context = [sourceId && "Source", pipelineId && "Pipeline"].filter(Boolean).join(" and ");
  return (
    <PageState variant="empty" action={filtered ? filteredAction : action ?? (context ? <Group gap="sm">
      {pipelineId ? <Button variant="default" component={AppLink} href={"/app/pipelines/" + encodeURIComponent(pipelineId)}>Open Pipeline</Button> : null}
      {sourceId ? <Button variant="default" component={AppLink} href={sourceHref ?? "/app/sources"}>{sourceHref ? "Open Source" : "View Sources"}</Button> : null}
    </Group> : undefined)} title={
      filtered ? `No ${records} match these filters`
        : context ? `No ${records} for this ${context}`
        : title ?? `No ${records} yet`
    }>
      {filtered ? "Adjust or clear the filters." : context ? null : children}
    </PageState>
  );
}
