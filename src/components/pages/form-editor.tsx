"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { useState, type ReactNode } from "react";
import {
  Anchor,
  Button,
  Code,
  Group,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import type { AdminPageDetail } from "@/shared/contracts/admin";
import type { PagePresentation } from "@/shared/contracts/page";
import { parseFormJson } from "@/shared/form-json";
import { AppLink } from "@/components/layout/app-link";
import {
  parsePageMessages,
  serializePageMessages,
} from "@/shared/page-messages-json";
import { EditorTabPanel as SettingsSection } from "@/components/patterns/editor-tabs";

export function FormEditor({
  footer,
  page,
  value,
  definition,
  changeDefinition,
  systemDefinition,
  changeSystemDefinition,
}: {
  footer?: ReactNode;
  page: AdminPageDetail;
  value: PagePresentation;
  definition: string;
  changeDefinition: (value: string) => void;
  systemDefinition: string;
  changeSystemDefinition: (value: string, language?: "en" | "cs") => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  let error = "";
  try {
    parseFormJson(definition, page.fields ?? [], page.sessionsEnabled ?? false);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Invalid definition.";
  }
  let systemError = "";
  try {
    parsePageMessages(systemDefinition, value.language ?? "en");
  } catch (reason) {
    systemError =
      reason instanceof Error ? reason.message : "Invalid system texts.";
  }
  return (
    <>
      <SettingsSection wide value="content" title="Content &amp; fields" forceMount>
        <Stack gap="md">
          <Text id="form-definition-help" size="sm" c="dimmed">
            Edit the title and introduction in JSON, then{" "}
            {page.sessionsEnabled
              ? "steps with nested fields. Keep step IDs unchanged when reordering."
              : "fields in display order."}{" "}
            Include every{" "}
            <Anchor
              component={AppLink}
              href={`/app/sources/${page.sourcePublicId}`}
              size="sm"
            >
              Source field
            </Anchor>{" "}
            exactly once.
          </Text>
          <Textarea
            ref={(element) => {
              element?.setCustomValidity(error);
            }}
            id="form-definition"
            label="Content & fields (JSON)"
            styles={{
              input: {
                fontFamily: "var(--mantine-font-family-monospace)",
                lineHeight: 1.6,
              },
            }}
            rows={Math.min(20, Math.max(6, definition.split("\n").length + 1))}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={Boolean(error)}
            aria-describedby={`form-definition-help${error ? " form-definition-error" : ""}`}
            value={definition}
            onChange={(event) => changeDefinition(event.target.value)}
          />
          {error ? (
            <Alert id="form-definition-error" role="alert" color="red">
              {error}
            </Alert>
          ) : null}
          <details>
            <Text
              component="summary"
              size="sm"
              py="xs"
              style={{ cursor: "pointer" }}
            >
              Format and example
            </Text>
            <Stack gap="sm" pt="xs" fz="sm" c="dimmed" miw={0}>
              <Code block>
                {JSON.stringify(
                  {
                    title: "Customer survey",
                    introduction: "Hello, {{name}}.",
                    ...(page.sessionsEnabled
                      ? {
                          steps: [
                            {
                              id: 1,
                              title: "Personal details",
                              fields: [
                                { name: "name", label: "Name", input: "text" },
                              ],
                            },
                          ],
                        }
                      : {
                          fields: [
                            { name: "name", label: "Name", input: "text" },
                          ],
                        }),
                  },
                  null,
                  2,
                )}
              </Code>
              <p>
                The root object defines the form title and introduction. Use{" "}
                {"{{field_name}}"} in text to insert an answer. Empty text uses
                the default title or hides the introduction.
              </p>
              <p>
                Optional field properties: <code>label</code>,{" "}
                <code>helpText</code>, <code>placeholder</code>,{" "}
                <code>input</code> (text, email or textarea for text fields),{" "}
                <code>defaultValue</code>, <code>queryParam</code>,{" "}
                <code>fallback</code>. Omit any unnecessary properties. Types
                and validation remain in Source fields.
              </p>
              <p>
                Saved answers override mapped URL values, then default values.
                Fallback only replaces missing answers in text templates. Empty
                steps are hidden in the public form.
              </p>
            </Stack>
          </details>
          {footer}
        </Stack>
      </SettingsSection>
      <SettingsSection
        value="messages"
        title="Buttons &amp; messages"
        forceMount
      >
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="sm">
            <Text
              id="system-definition-help"
              size="sm"
              c="dimmed"
              style={{ flex: "1 1 240px" }}
            >
              Keep property names and variables unchanged. Omitted messages use
              defaults.
            </Text>
            <Button
              variant="default"
              type="button"
              onClick={() => setResetOpen(true)}
            >
              Reset to defaults
            </Button>
          </Group>
          <ConfirmDialog
            opened={resetOpen}
            title="Reset buttons and messages?"
            confirmLabel="Reset to defaults"
            tone="default"
            onCancel={() => setResetOpen(false)}
            onConfirm={() => {
              changeSystemDefinition(serializePageMessages("en"), "en");
              setResetOpen(false);
            }}
          >
            Replace this draft with the default English texts? Changes take
            effect only after Save form.
          </ConfirmDialog>
          <Textarea
            ref={(element) => element?.setCustomValidity(systemError)}
            id="system-definition"
            label="Buttons & messages (JSON)"
            styles={{
              input: {
                fontFamily: "var(--mantine-font-family-monospace)",
                lineHeight: 1.6,
              },
            }}
            rows={12}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={Boolean(systemError)}
            aria-describedby={`system-definition-help${systemError ? " system-definition-error" : ""}`}
            value={systemDefinition}
            onChange={(event) => changeSystemDefinition(event.target.value)}
          />
          {systemError ? (
            <Alert id="system-definition-error" role="alert" color="red">
              {systemError}
            </Alert>
          ) : null}
          <details>
            <Text
              component="summary"
              size="sm"
              py="xs"
              style={{ cursor: "pointer" }}
            >
              Format and example
            </Text>
            <Stack gap="sm" pt="xs" fz="sm" c="dimmed" miw={0}>
              <Code block>
                {JSON.stringify(
                  {
                    submit: "Submit",
                    success: "Response submitted.",
                    confirmationText: "Thank you, {{name}}.",
                  },
                  null,
                  2,
                )}
              </Code>
              <p>
                Edit the text values in JSON to customize buttons, validation
                and status messages. Keep property names and variables such as{" "}
                <code>{"{current}"}</code> and <code>{"{minLength}"}</code>{" "}
                unchanged; omitted messages use their defaults.
              </p>
              <p>
                <code>confirmationText</code> is prefilled with the message
                shown after submission. Customize it, leave it empty to use{" "}
                <code>success</code>, or include <code>{"{{field_name}}"}</code>{" "}
                to insert an answer. Redirect URL in Configuration takes
                precedence.
              </p>
              <p>
                Use plain text. Reset to defaults restores English messages,
                including the confirmation text in this draft. Save form applies
                changes to both JSON editors.
              </p>
            </Stack>
          </details>
          {footer}
        </Stack>
      </SettingsSection>
    </>
  );
}
