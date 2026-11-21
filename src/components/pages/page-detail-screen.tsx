"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import { PageRowActions } from "./pages-list";

import { getPage, updatePage } from "@/client/admin-api/pages";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import { PageConfiguration } from "@/components/pages/page-configuration";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Anchor, Button } from "@mantine/core";

export function PageDetailScreen({ pageId }: { pageId: string }) {
  return <PageDetailScreenContent key={pageId} pageId={pageId} />;
}

function PageDetailScreenContent({ pageId }: { pageId: string }) {
  const page = useAdminResource(() => getPage(pageId), pageId, {
    policy: "ambient",
  });
  const navigation = useAppNavigation();
  const back = { href: "/app/pages", label: "Back to all Built-in Forms" };
  const header = (
    <PageHeader
      back={back}
      metadata={`ID: ${page.data?.pageId ?? pageId}`}
      title={page.data?.name ?? "Built-in Form"}
    />
  );
  if (page.loading)
    return (
      <PageWorkspace navigationReady={false}>
        {header}
        <AdminResourceNotice resource={page} />
        <PageState title="Loading Built-in Form" variant="loading" />
      </PageWorkspace>
    );
  if (page.error || !page.data)
    return (
      <PageWorkspace>
        {header}
        <AdminResourceNotice resource={page} />
        <PageState
          action={<Button onClick={page.refresh}>Try again</Button>}
          title="Built-in Form could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );

  const previewAvailable = Boolean(page.data.fields?.length);
  const actions = (
    <PageRowActions
      key={page.data.pageId}
      detail
      page={page.data}
      onChanged={page.refresh}
      onDeleted={() => navigation.go("/app/pages")}
    />
  );
  return (
    <PageWorkspace>
      <PageHeader
        back={back}
        documentTitle={page.data.name + " · Built-in Form"}
        metadata={`ID: ${page.data.pageId}`}
        actions={actions}
        status={
          <StatusBadge status={page.data.enabled ? "success" : "inactive"}>
            {page.data.enabled ? "Published" : "Draft"}
          </StatusBadge>
        }
        title={page.data.name}
      />
      <AdminResourceNotice resource={page} />
      {!previewAvailable ? (
        <Alert color="blue" role="alert">
          This Built-in Form needs Source fields before it can be previewed or
          published.{" "}
          <Anchor
            component={AppLink}
            href={
              "/app/sources/" + encodeURIComponent(page.data.sourcePublicId)
            }
            size="sm"
          >
            Configure Source fields
          </Anchor>
        </Alert>
      ) : null}
      <PageConfiguration
        onSaved={page.refresh}
        page={page.data}
        save={updatePage}
      />
    </PageWorkspace>
  );
}
