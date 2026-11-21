"use client";

import {
  listSources,
  listTags,
  type AdminSourceSummary,
} from "@/client/admin-api/sources";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { CreateSourceDialog } from "@/components/sources/create-source-dialog";
import {
  SourcesList,
  type SourcesListQuery,
} from "@/components/sources/sources-list";
import { useAppNavigation } from "@/components/layout/app-link";
import { CollectionSkeleton } from "@/components/patterns/collection-skeleton";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { Button } from "@mantine/core";
import type { AdminTag } from "@/shared/contracts/admin";
import { useEffect, useState } from "react";

type SourcesScreenProperties = {
  initialQuery?: SourcesListQuery;
  loadSources?: () => Promise<AdminSourceSummary[]>;
  loadTags?: () => Promise<AdminTag[]>;
};

function SourcesActions() {
  return <CreateSourceDialog trigger={<Button>Create Source</Button>} />;
}

export function SourcesScreen({
  initialQuery,
  loadSources = listSources,
  loadTags = listTags,
}: SourcesScreenProperties) {
  const navigation = useAppNavigation();
  const sources = useAdminResource(loadSources, undefined, { policy: "ambient" });
  const [tags, setTags] = useState<AdminTag[]>([]);
  useEffect(() => {
    void loadTags()
      .then(setTags)
      .catch(() => undefined);
  }, [loadTags]);
  const header = (
    <PageHeader
      actions={<SourcesActions />}

      title="Data Sources"
    />
  );

  if (sources.loading) {
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header}<AdminResourceNotice resource={sources} />
        <CollectionSkeleton label="Loading Sources" />
      </PageWorkspace>
    );
  }

  if (sources.error || !sources.data) {
    return (
      <PageWorkspace width="collection">
        {header}<AdminResourceNotice resource={sources} />
        <PageState
          action={
            <Button onClick={sources.refresh} type="button">
              Try again
            </Button>
          }
          title="Sources could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  }

  return (
    <PageWorkspace width="collection">
      {header}<AdminResourceNotice resource={sources} />
      <SourcesList
        initialQuery={initialQuery}
        onChanged={sources.refresh}
        onQueryChange={initialQuery ? (query) => {
          const parameters = new URLSearchParams();
                if (query.search) parameters.set("search", query.search);
          if (query.page !== "1") parameters.set("page", query.page);
          if (query.size !== "10") parameters.set("size", query.size);
          if (query.status) parameters.set("status", query.status);
          for (const tagId of query.tagId) parameters.append("tagId", tagId);
          const value = parameters.toString();
          navigation.go(value ? `/app/sources?${value}` : "/app/sources");
        } : undefined}
        sources={sources.data}
        tags={tags}
      />
    </PageWorkspace>
  );
}
