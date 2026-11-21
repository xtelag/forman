"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import {
  Button,
  Code,
  Group,
  NativeSelect,
  Stack,
  Text,
} from "@mantine/core";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { SourceCodeBlock } from "@/components/sources/source-code-block";
import {
  PopupSourcePreviewButton,
  type PopupPreviewField,
} from "@/components/sources/popup-source-preview-button";
import { M2mTestSubmissionDialog } from "@/components/sources/m2m-test-submission-dialog";
import { ResourceSection } from "@/components/patterns/resource-section";
import type { AdminSourceDetailResponse } from "@/shared/contracts/admin";

export function SourceIntegrations({
  embedded = false,
  sourceId,
  sourceName,
  integration,
  previewFields,
  onConfigureFields,
}: Pick<AdminSourceDetailResponse, "integration"> & {
  onConfigureFields?: () => void;
  embedded?: boolean;
  sourceId: string;
  sourceName: string;
  previewFields?: PopupPreviewField[];
  serverToken: string | null;
}) {
  const mode = integration.sourceType;
  const [language, setLanguage] = useState(
    mode === "one-shot" ? "HTML" : "JavaScript",
  );
  const format =
    mode === "session" && (language === "HTML" || language === "Popup")
      ? "JavaScript"
      : language;
  const isPopup = mode === "one-shot" && format === "Popup";
  const code = isPopup
    ? integration.popupSource
    : mode === "m2m"
      ? integration.m2mCurl
      : mode === "session"
        ? ((format === "React"
            ? integration.sessionReactJsx
            : integration.sessionJavaScript) ?? "")
        : format === "HTML"
          ? integration.browserHtml
          : format === "React"
            ? integration.reactJsx
            : integration.browserJavaScript;
  const label = isPopup
    ? "HTML"
    : mode === "m2m"
      ? "curl"
      : format === "React"
        ? "JSX"
        : format;
  const content = (
    <Stack gap="md" miw={0}>
      {!integration.examplesAvailable ? (
        <>
          <Alert
            color="blue"
            icon={<InfoIcon size={18} />}
            title="Field definition required"
            role="note"
          >
            <Stack gap="sm" align="flex-start">
              <Text size="sm">
                Add a field definition to generate integration examples.
              </Text>
              <Button variant="default" onClick={onConfigureFields}>
                Configure Source fields
              </Button>
            </Stack>
          </Alert>
          <Text size="sm" c="dimmed">
            This Source accepts flat fields without a schema.
          </Text>
          <Stack component="dl" gap="sm">
            {Object.entries(integration.endpoints)
              .filter(([, url]) => url)
              .map(([key, url]) => (
                <div key={key}>
                  <Text component="dt" size="sm" fw={500} c="dimmed">
                    {key === "challenge"
                      ? "ALTCHA challenge"
                      : {
                          "one-shot": "One-shot",
                          session: "Session",
                          m2m: "M2M",
                        }[mode]}
                  </Text>
                  <Text component="dd" size="sm" m={0}>
                    <Code style={{ overflowWrap: "anywhere" }}>
                      {key === "challenge" ? "GET" : "POST"} {url}
                    </Code>
                  </Text>
                </div>
              ))}
          </Stack>
        </>
      ) : (
        <>
          {mode !== "one-shot" ? (
            <Text size="sm" c="dimmed">
              {mode === "session"
                ? "Next/Back saves drafts; Submit finishes the session. ALTCHA and honeypot run at session creation. Each request uses the secret sessionId, without an Authorization header."
                : "Keep the Source token in server-side FORMAN_SERVER_TOKEN, never in frontend code."}
            </Text>
          ) : null}
          {integration.warnings.map((warning) => (
            <Alert
              key={warning.title}
              title={warning.title}
              color={warning.variant === "info" ? "blue" : "yellow"}
              icon={
                warning.variant === "info" ? (
                  <InfoIcon size={18} />
                ) : (
                  <TriangleAlertIcon size={18} />
                )
              }
              role={warning.variant === "info" ? "note" : "alert"}
            >
              {warning.message}
            </Alert>
          ))}
          {mode !== "m2m" ? (
            <Group align="flex-end">
              <NativeSelect
                label="Example"
                id={`integration-example-${sourceId}`}
                w={220}
                maw="100%"
                value={format}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {mode === "one-shot" ? <option>HTML</option> : null}
                <option>JavaScript</option>
                <option value="React">React / JSX</option>
                {mode === "one-shot" ? <option>Popup</option> : null}
              </NativeSelect>
              {isPopup ? (
                <PopupSourcePreviewButton
                  fields={previewFields}
                  sourceId={sourceId}
                  sourceName={sourceName}
                />
              ) : null}
            </Group>
          ) : (
            <M2mTestSubmissionDialog sourceId={sourceId} />
          )}
          <SourceCodeBlock code={code} label={label} />
        </>
      )}
    </Stack>
  );
  return embedded ? (
    content
  ) : (
    <ResourceSection
      title="Integration examples"
    >
      {content}
    </ResourceSection>
  );
}
