"use client";

import { useEffect, useRef } from "react";
import {
  getPipeline,
  type AdminPipelineDetail,
} from "@/client/admin-api/pipelines";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { EditPipelineScreen } from "@/components/pipelines/new-pipeline-screen";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { Button } from "@mantine/core";

export function PipelineDetailScreen({
  pipelineId,
  loadPipeline = getPipeline,
}: {
  pipelineId: string;
  loadPipeline?: (id: string) => Promise<AdminPipelineDetail>;
}) {
  const resource = useAdminResource(
    () => loadPipeline(pipelineId),
    pipelineId,
    { policy: "ambient" },
  );
  const scrolledToActions = useRef(false);
  useEffect(() => {
    if (
      !scrolledToActions.current &&
      resource.data &&
      window.location.hash === "#actions"
    ) {
      const frame = requestAnimationFrame(() => {
        document.getElementById("actions")?.scrollIntoView();
        scrolledToActions.current = true;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [resource.data]);
  const header = (
    <PageHeader
      back={{ href: "/app/pipelines", label: "Back to all Pipelines" }}
      metadata={`ID: ${pipelineId}`}
      title="Pipeline"
    />
  );

  if (resource.loading)
    return (
      <PageWorkspace>
        {header}
        <PageState title="Loading Pipeline" variant="loading" />
      </PageWorkspace>
    );
  if (resource.error || !resource.data)
    return (
      <PageWorkspace>
        {header}
        <PageState
          action={
            <Button onClick={resource.refresh} type="button">
              Try again
            </Button>
          }
          title="Pipeline could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );

  return (
    <EditPipelineScreen
      freshnessNotice={<AdminResourceNotice resource={resource} />}
      pipeline={resource.data}
    />
  );
}
