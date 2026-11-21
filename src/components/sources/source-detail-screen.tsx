"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import {
  EditorTabs,
  useEditorTabState,
  EditorTabPanel as SourceDetailSection,
} from "@/components/patterns/editor-tabs";
import { Anchor, Button, Group, List, Text } from "@mantine/core";

import { TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { notifySaved } from "@/components/patterns/save-bar";

import {
  deleteSource,
  getSource,
  getServerToken,
  saveSourceSettingsSection,
  setSourceEnabled,
} from "@/client/admin-api/sources";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { SourceActions } from "@/components/sources/source-actions";
import { SourceConfiguration } from "@/components/sources/source-configuration";
import { SourceIntegrations } from "@/components/sources/source-integrations";
import type { PopupPreviewField } from "@/components/sources/popup-source-preview-button";
import { SourceTagsConfiguration } from "@/components/sources/source-tags-configuration";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { StatusBadge } from "@/components/patterns/status-badge";
import type {
  AdminSourceDetail,
  AdminSourceDetailResponse,
} from "@/shared/contracts/admin";

const sourceSections = [
  { value: "configuration", label: "Configuration" },
  { value: "source fields", label: "Source fields" },
  { value: "protection", label: "Protection" },
  { value: "integrations", label: "Integration" },
  { value: "pipelines", label: "Pipelines" },
  { value: "tags", label: "Tags" },
  { value: "advanced configuration", label: "Advanced" },
];

type SourceDetailScreenProperties = {
  deleteSource?: (sourceId: string) => Promise<void>;
  sourceId: string;
  loadSource?: (sourceId: string) => Promise<AdminSourceDetailResponse>;
  setSourceState?: (
    sourceId: string,
    enabled: boolean,
  ) => Promise<AdminSourceDetail>;
};

function popupPreviewFields(source: AdminSourceDetail): PopupPreviewField[] {
  if (!source.fieldDefinitionMode || !source.fieldDefinitionSource) return [];
  const label = (name: string) =>
    name
      .replace(/[_-]+/g, " ")
      .replace(/^./, (character) => character.toUpperCase());
  const typeFor = (
    name: string,
    type: unknown,
    format?: unknown,
  ): PopupPreviewField["type"] => {
    if (type === "boolean") return "checkbox";
    if (type === "number" || type === "integer") return "number";
    if (format === "email" || name.toLowerCase().includes("email"))
      return "email";
    return /(?:message|note|comment|description)$/i.test(name)
      ? "textarea"
      : "text";
  };
  try {
    if (source.fieldDefinitionMode === "json-schema") {
      const schema = JSON.parse(source.fieldDefinitionSource) as {
        properties?: Record<
          string,
          { format?: unknown; title?: unknown; type?: unknown }
        >;
        required?: unknown;
      };
      const required = new Set(
        Array.isArray(schema.required)
          ? schema.required.filter(
              (name): name is string => typeof name === "string",
            )
          : [],
      );
      return Object.entries(schema.properties ?? {}).map(([name, field]) => ({
        label: typeof field.title === "string" ? field.title : label(name),
        name,
        required: required.has(name),
        type: typeFor(name, field.type, field.format),
        ...(field.type === "boolean" ? { value: "true" } : {}),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export function SourceDetailScreen({
  deleteSource: removeSource = deleteSource,
  sourceId,
  loadSource = getSource,
  setSourceState = setSourceEnabled,
}: SourceDetailScreenProperties) {
  const [focusFields, setFocusFields] = useState(false);
  useEffect(() => {
    if (!focusFields) return;
    let frame: number;
    const focusWhenVisible = () => {
      const field = document.getElementById("field-definition");
      if (field && field.getClientRects().length > 0) {
        field.focus();
        setFocusFields(false);
      } else {
        frame = requestAnimationFrame(focusWhenVisible);
      }
    };
    frame = requestAnimationFrame(focusWhenVisible);
    return () => cancelAnimationFrame(frame);
  }, [focusFields, sourceId]);
  const [activeTab, setActiveTab] = useEditorTabState(
    `source:${sourceId}`,
    "configuration",
  );
  const resource = useAdminResource(() => loadSource(sourceId), sourceId, {
    policy: "ambient",
  });
  const navigation = useAppNavigation();
  const [serverToken, setServerToken] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const back = { href: "/app/sources", label: "Back to all Sources" };
  const header = (
    <PageHeader
      back={back}
      metadata={`ID: ${resource.data?.source.sourceId ?? sourceId}`}
      title={resource.data?.source.name ?? "Source"}
    />
  );

  useEffect(() => {
    const tokenSourceId = resource.data?.source.sourceId;
    if (!tokenSourceId || resource.data?.source.type !== "m2m") return;
    let active = true;
    void getServerToken(tokenSourceId)
      .then(({ token }) => {
        if (active) setServerToken(token);
      })
      .catch(() => {
        if (active) setServerToken(null);
      });
    return () => {
      active = false;
    };
  }, [resource.data?.source.sourceId, resource.data?.source.type]);

  if (resource.loading)
    return (
      <PageWorkspace navigationReady={false}>
        {header}
        <AdminResourceNotice resource={resource} />
        <PageState title="Loading Source" variant="loading" />
      </PageWorkspace>
    );
  if (resource.error || !resource.data)
    return (
      <PageWorkspace>
        {header}
        <AdminResourceNotice resource={resource} />
        <PageState
          action={
            <Button onClick={resource.refresh} type="button">
              Try again
            </Button>
          }
          title="Source could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );

  const {
    pipelines,
    source,
    integration,
    observedFieldNames,
    submissionCount,
  } = resource.data;
  return (
    <PageWorkspace>
      <PageHeader
        back={back}
        documentTitle={source.name + " · Source"}
        metadata={`${source.type === "session" ? "Session" : source.type === "m2m" ? "M2M" : "One-shot"} · ID: ${source.sourceId}`}
        actions={
          <SourceActions
            deleteSource={removeSource}
            source={source}
            onDeleted={() => navigation.go("/app/sources")}
            onError={setStateError}
            refresh={resource.refresh}
            setSourceState={setSourceState}
            submissionCount={submissionCount}
            pipelineCount={pipelines.length}
            pageCount={resource.data.pageCount}
          />
        }
        status={
          <StatusBadge status={source.enabled ? "success" : "inactive"}>
            {source.enabled ? "Active" : "Inactive"}
          </StatusBadge>
        }
        title={source.name}
      />
      <AdminResourceNotice resource={resource} />
      {!source.enabled ? (
        <Alert
          aria-live="polite"
          role="status"
          color="yellow"
          icon={<TriangleAlertIcon size={18} />}
          title="Source inactive"
        >
          Inactive Sources cannot receive Submissions.
        </Alert>
      ) : null}
      {stateError ? (
        <Alert color="red" role="alert">
          {stateError}
        </Alert>
      ) : null}
      <SourceConfiguration
        sessionSettings={resource.data.sessionSettings}
        source={source}
        onServerTokenChange={setServerToken}
        observedFieldNames={observedFieldNames}
        renderLayout={(
          configurationSection,
          protectionSection,
          fieldsSection,
          advancedSection,
        ) => (
          <EditorTabs
            value={activeTab}
            onChange={setActiveTab}
            sections={sourceSections}
            label="Source sections"
          >
            {configurationSection}
            {fieldsSection}
            {protectionSection}
            <SourceDetailSection
              wide
              title="Integration examples"
              value="integrations"
            >
              <SourceIntegrations
                onConfigureFields={() => {
                  setActiveTab("source fields");
                  setFocusFields(true);
                }}
                embedded
                sourceId={source.sourceId}
                sourceName={source.name}
                integration={integration}
                previewFields={popupPreviewFields(source)}
                serverToken={source.type === "m2m" ? serverToken : null}
              />
            </SourceDetailSection>
            <SourceDetailSection title="Pipelines" value="pipelines">
              {pipelines.length ? (
                <List
                  listStyleType="none"
                  spacing="sm"
                  aria-label="Attached Pipelines"
                >
                  {pipelines.map((pipeline) => {
                    const count = pipeline.steps.filter(
                      (step) => step.enabled,
                    ).length;
                    return (
                      <List.Item key={pipeline.id}>
                        <Group gap="md">
                          <Anchor
                            component={AppLink}
                            href={"/app/pipelines/" + pipeline.id}
                            size="sm"
                            fw={500}
                          >
                            {pipeline.name}
                          </Anchor>
                          <Text size="sm" c="dimmed">
                            {count} {count === 1 ? "Action" : "Actions"}
                          </Text>
                        </Group>
                      </List.Item>
                    );
                  })}
                </List>
              ) : (
                <PageState embedded variant="empty" title="No Pipelines attached" />
              )}
            </SourceDetailSection>
            <SourceDetailSection title="Tags" value="tags">
              <SourceTagsConfiguration
                sourceId={source.sourceId}
                initialTags={source.tags}
              />
            </SourceDetailSection>
            {advancedSection}
          </EditorTabs>
        )}
        renderSection={({ children, description, title }) => (
          <SourceDetailSection
            description={description}
            framed={title !== "Advanced configuration" && !(title === "Protection" && source.type !== "m2m")}
            wide={title === "Source fields"}
            forceMount
            title={title}
            value={title.toLowerCase()}
          >
            {children}
          </SourceDetailSection>
        )}
        saveSection={async (section, values) => {
          await saveSourceSettingsSection(source.sourceId, section, values);
          notifySaved("Source settings saved");
          resource.refresh();
        }}
      />
    </PageWorkspace>
  );
}
