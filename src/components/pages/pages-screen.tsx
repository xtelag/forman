"use client";

import { listPages } from "@/client/admin-api/pages";
import { listTags } from "@/client/admin-api/sources";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { CreatePageDialog } from "@/components/pages/create-page-dialog";
import { useAppNavigation } from "@/components/layout/app-link";
import { PagesList, type PagesListQuery } from "@/components/pages/pages-list";
import { CollectionSkeleton } from "@/components/patterns/collection-skeleton";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { Button } from "@mantine/core";
import type { AdminPageSummary, AdminTag } from "@/shared/contracts/admin";
import { useEffect, useState } from "react";

export function PagesScreen({
  initialQuery,
  loadPages = listPages,
  loadTags = listTags,
}: {
  initialQuery?: PagesListQuery & { create?: string };
  loadPages?: () => Promise<AdminPageSummary[]>;
  loadTags?: () => Promise<AdminTag[]>;
}) {
  const navigation = useAppNavigation();
  const resource = useAdminResource(loadPages, undefined, {
    policy: "ambient",
  });
  const [tags, setTags] = useState<AdminTag[]>([]);
  useEffect(() => {
    void loadTags()
      .then(setTags)
      .catch(() => undefined);
  }, [loadTags]);
  const header = (
    <PageHeader
      actions={<CreatePageDialog key={String(initialQuery?.create) + ":" + (initialQuery?.sourceId ?? "")} initialSourceId={initialQuery?.sourceId} initiallyOpen={initialQuery?.create === "1"} />}

      title="Built-in Forms"
    />
  );
  if (resource.loading)
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header}
        <AdminResourceNotice resource={resource} />
        <CollectionSkeleton label="Loading Built-in Forms" />
      </PageWorkspace>
    );
  if (resource.error || !resource.data)
    return (
      <PageWorkspace width="collection">
        {header}
        <AdminResourceNotice resource={resource} />
        <PageState
          action={<Button onClick={resource.refresh}>Try again</Button>}
          title="Built-in Forms could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  return (
    <PageWorkspace width="collection">
      {header}
      <AdminResourceNotice resource={resource} />
      <PagesList
        initialQuery={initialQuery}
        onDeleted={resource.refresh}
        onQueryChange={
          initialQuery
            ? (query) => {
                const parameters = new URLSearchParams();
                if (query.search) parameters.set("search", query.search);
                if (query.sourceId) parameters.set("sourceId", query.sourceId);
                if (query.page !== "1") parameters.set("page", query.page);
                if (query.size !== "10") parameters.set("size", query.size);
                for (const tagId of query.tagId)
                  parameters.append("tagId", tagId);
                const value = parameters.toString();
                navigation.go(value ? `/app/pages?${value}` : "/app/pages");
              }
            : undefined
        }
        pages={resource.data}
        tags={tags}
      />
    </PageWorkspace>
  );
}
