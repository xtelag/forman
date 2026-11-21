"use client";
import { FormFields, FormGroup } from "@/components/patterns/form-layout";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { SaveBar } from "@/components/patterns/save-bar";
import {
  Checkbox,
  Group,
  NativeSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";

import { isSafeSuccessUrl } from "@/shared/contracts/sources";
import { useUnsavedChanges } from "@/client/use-unsaved-changes";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type { SourceSettingsSection } from "@/client/admin-api/sources";
import { AdminApiError } from "@/client/admin-api/client";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import { ResourceSection } from "@/components/patterns/resource-section";
import { ServerTokenPanel } from "@/components/sources/server-token-panel";
import {
  defaultSessionSettings,
  type SessionSettings,
} from "@/shared/contracts/source-session";
import type { AdminSourceDetail } from "@/shared/contracts/admin";

import {
  sourceFieldTemplates,
  type SourceFieldTemplate,
} from "@/shared/source-field-templates";

type SourceConfigurationProperties = {
  sessionSettings?: SessionSettings;
  source: AdminSourceDetail;
  onServerTokenChange?: (token: string | null) => void;
  observedFieldNames: string[];
  renderLayout?: (
    configuration: ReactNode,
    protection: ReactNode,
    fields: ReactNode,
    advanced: ReactNode,
  ) => ReactNode;
  renderSection?: (section: {
    children: ReactNode;
    description?: string;
    title:
      | "Configuration"
      | "Advanced configuration"
      | "Protection"
      | "Source fields";
  }) => ReactNode;
  saveSection: (
    section: SourceSettingsSection,
    values: Record<string, unknown>,
  ) => Promise<unknown>;
};

type SourceConfigurationSectionProperties = {
  children: ReactNode;
  description?: string;
  renderSection?: SourceConfigurationProperties["renderSection"];
  title:
    "Configuration" | "Advanced configuration" | "Protection" | "Source fields";
};

function SourceConfigurationSection({
  children,
  description,
  renderSection,
  title,
}: SourceConfigurationSectionProperties) {
  return renderSection ? (
    <>{renderSection({ children, description, title })}</>
  ) : (
    <ResourceSection description={description} title={title}>
      {children}
    </ResourceSection>
  );
}

function optionalNumber(value: FormDataEntryValue | null) {
  return value === "" || value === null ? null : Number(value);
}

function requiredNumber(formData: FormData, name: string) {
  return Number(formData.get(name));
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function editableSchema(value: string | null | undefined) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function sameValues(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function SourceConfiguration({
  source,
  sessionSettings = defaultSessionSettings,
  onServerTokenChange,
  renderLayout,
  renderSection,
  saveSection,
}: SourceConfigurationProperties) {
  const sessionEnabled = source.type === "session";
  const isM2m = source.type === "m2m";
  const [templateToConfirm, setTemplateToConfirm] =
    useState<SourceFieldTemplate | null>(null);
  function applyTemplate(template: SourceFieldTemplate) {
    if (template === "survey" && !sessionEnabled) return;
    const definition = JSON.stringify(sourceFieldTemplates[template], null, 2);
    setFieldDefinitionSource(definition);
    updateFieldsDirty(definition);
    setTemplateToConfirm(null);
  }
  const [error, setError] = useState<{
    message?: string;
    section: SourceSettingsSection;
    type: "conflict" | "invalid";
  } | null>(null);
  const [dirty, setDirty] = useState<Record<SourceSettingsSection, boolean>>({
    configuration: false,
    advanced: false,
    "source-fields": false,
    protection: false,
  });
  const [successUrlError, setSuccessUrlError] = useState<string | null>(null);
  const [pending, setPending] = useState<SourceSettingsSection | null>(null);
  const [fieldDefinitionSource, setFieldDefinitionSource] = useState(
    editableSchema(source.fieldDefinitionSource),
  );
  const [newerSections, setNewerSections] = useState<
    Record<SourceSettingsSection, boolean>
  >({
    configuration: false,
    advanced: false,
    "source-fields": false,
    protection: false,
  });
  const [sectionRevisions, setSectionRevisions] = useState<
    Record<SourceSettingsSection, number>
  >({ configuration: 0, advanced: 0, "source-fields": 0, protection: 0 });
  const latestSource = useRef(JSON.stringify({ source, sessionSettings }));

  useUnsavedChanges(Object.values(dirty).some(Boolean));

  function reloadSection(section: SourceSettingsSection) {
    if (section === "source-fields") {
      setFieldDefinitionSource(editableSchema(source.fieldDefinitionSource));
    }
    setDirty((current) => ({ ...current, [section]: false }));
    setNewerSections((current) => ({ ...current, [section]: false }));
    setSectionRevisions((current) => ({
      ...current,
      [section]: current[section] + 1,
    }));
  }

  useEffect(() => {
    const signature = JSON.stringify({ source, sessionSettings });
    if (signature === latestSource.current) return;
    latestSource.current = signature;
    queueMicrotask(() => {
      setNewerSections((current) => ({
        configuration: current.configuration || dirty.configuration,
        advanced: current.advanced || dirty.advanced,
        "source-fields": current["source-fields"] || dirty["source-fields"],
        protection: current.protection || dirty.protection,
      }));
      setSectionRevisions((current) => ({
        configuration: current.configuration + (dirty.configuration ? 0 : 1),
        advanced: current.advanced + (dirty.advanced ? 0 : 1),
        "source-fields":
          current["source-fields"] + (dirty["source-fields"] ? 0 : 1),
        protection: current.protection + (dirty.protection ? 0 : 1),
      }));
      if (!dirty["source-fields"]) {
        setFieldDefinitionSource(editableSchema(source.fieldDefinitionSource));
      }
    });
  }, [dirty, source, sessionSettings]);

  const savedValues: Record<SourceSettingsSection, Record<string, unknown>> = {
    configuration: {
      name: source.name,
      ...(!isM2m ? { successUrl: source.successUrl } : {}),
    },
    advanced: {
      ...(sessionEnabled
        ? {
            sessionInactivityDays: sessionSettings.inactivityDays,
            sessionCompletedRetentionDays:
              sessionSettings.completedRetentionDays,
          }
        : {}),
      ...(!isM2m
        ? { challengeRateLimitPerMinute: source.challengeRateLimitPerMinute }
        : {}),
      maxBodyBytes: source.maxBodyBytes,
      maxEntries: source.maxEntries,
      maxKeyLength: source.maxKeyLength,
      maxUniqueKeys: source.maxUniqueKeys,
      maxValueLength: source.maxValueLength,
      maxValuesPerKey: source.maxValuesPerKey,
      retentionDays: source.retentionDays,
      storeReferer: source.storeReferer,
      storeUserAgent: source.storeUserAgent,
      submissionRateLimitPerMinute: source.submissionRateLimitPerMinute,
    },
    "source-fields": {
      fieldDefinitionMode: source.fieldDefinitionMode,
      fieldDefinitionSource: source.fieldDefinitionSource
        ? editableSchema(source.fieldDefinitionSource)
        : null,
    },
    protection: {
      allowedOrigins: source.allowedOrigins,
      altchaEnabled: source.altchaEnabled,
      honeypotEnabled: source.honeypotEnabled,
      honeypotFieldNames: source.honeypotFieldNames,
    },
  };

  function currentValues(formData: FormData) {
    const allowedOrigins = String(formData.get("allowedOrigins") ?? "")
      .split("\n")
      .map((origin) => origin.trim())
      .filter(Boolean);
    const configuration = {
      allowedOrigins:
        allowedOrigins.length === 1 && allowedOrigins[0] === "*"
          ? []
          : allowedOrigins,
      altchaEnabled: checked(formData, "altchaEnabled"),
      challengeRateLimitPerMinute: optionalNumber(
        formData.get("challengeRateLimitPerMinute"),
      ),
      fieldDefinitionMode: fieldDefinitionSource.trim() ? "json-schema" : null,
      fieldDefinitionSource: fieldDefinitionSource.trim() || null,
      honeypotEnabled: checked(formData, "honeypotEnabled"),
      honeypotFieldNames: String(formData.get("honeypotFieldNames") ?? "")
        .replace(/\s/g, "")
        .split(","),
      maxBodyBytes: requiredNumber(formData, "maxBodyBytes"),
      maxEntries: requiredNumber(formData, "maxEntries"),
      maxKeyLength: requiredNumber(formData, "maxKeyLength"),
      maxUniqueKeys: requiredNumber(formData, "maxUniqueKeys"),
      maxValueLength: requiredNumber(formData, "maxValueLength"),
      maxValuesPerKey: requiredNumber(formData, "maxValuesPerKey"),
      name: String(formData.get("name") ?? "").trim(),
      retentionDays: optionalNumber(formData.get("retentionDays")),
      storeReferer: checked(formData, "storeReferer"),
      storeUserAgent: checked(formData, "storeUserAgent"),
      submissionRateLimitPerMinute: optionalNumber(
        formData.get("submissionRateLimitPerMinute"),
      ),
      successUrl: String(formData.get("successUrl") ?? "").trim() || null,
    };
    return {
      configuration: {
        name: configuration.name,
        ...(!isM2m ? { successUrl: configuration.successUrl } : {}),
      },
      advanced: {
        ...(sessionEnabled
          ? {
              sessionInactivityDays: requiredNumber(
                formData,
                "sessionInactivityDays",
              ),
              sessionCompletedRetentionDays: requiredNumber(
                formData,
                "sessionCompletedRetentionDays",
              ),
            }
          : {}),
        ...(!isM2m
          ? {
              challengeRateLimitPerMinute:
                configuration.challengeRateLimitPerMinute,
            }
          : {}),
        maxBodyBytes: configuration.maxBodyBytes,
        maxEntries: configuration.maxEntries,
        maxKeyLength: configuration.maxKeyLength,
        maxUniqueKeys: configuration.maxUniqueKeys,
        maxValueLength: configuration.maxValueLength,
        maxValuesPerKey: configuration.maxValuesPerKey,
        retentionDays: configuration.retentionDays,
        storeReferer: configuration.storeReferer,
        storeUserAgent: configuration.storeUserAgent,
        submissionRateLimitPerMinute:
          configuration.submissionRateLimitPerMinute,
      },
      "source-fields": {
        fieldDefinitionMode: configuration.fieldDefinitionMode,
        fieldDefinitionSource: configuration.fieldDefinitionSource,
      },
      protection: (({
        allowedOrigins,
        altchaEnabled,
        honeypotEnabled,
        honeypotFieldNames,
      }) => ({
        allowedOrigins,
        altchaEnabled,
        honeypotEnabled,
        honeypotFieldNames,
      }))(configuration),
    };
  }

  function updateDirty(
    section: SourceSettingsSection,
    formElement: HTMLFormElement,
  ) {
    const values = currentValues(new FormData(formElement));
    setError((current) => current?.section === section ? null : current);
    if (section === "configuration") setSuccessUrlError(null);
    setDirty((current) => ({
      ...current,
      [section]: !sameValues(values[section], savedValues[section]),
    }));
  }

  function updateFieldsDirty(value: string) {
    const normalizedSource = value.trim() || null;
    const values = {
      fieldDefinitionMode: normalizedSource ? "json-schema" : null,
      fieldDefinitionSource: normalizedSource,
    };
    setDirty((current) => ({
      ...current,
      "source-fields": !sameValues(values, savedValues["source-fields"]),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fields = currentValues(formData);

    const section = (
      (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    )?.value as SourceSettingsSection;
    if (!section) return;
    const successUrl = String(formData.get("successUrl") ?? "").trim();
    if (section === "configuration" && successUrl && !isSafeSuccessUrl(successUrl)) {
      setSuccessUrlError("Use HTTPS (or HTTP on localhost), or leave this field empty.");
      form.querySelector<HTMLInputElement>("[name=successUrl]")?.focus();
      return;
    }
    setPending(section);
    setError(null);
    try {
      await saveSection(section, fields[section]);
      setDirty((current) => ({ ...current, [section]: false }));
    } catch (caughtError) {
      setError({
        ...(caughtError instanceof AdminApiError && caughtError.status !== 409
          ? { message: caughtError.message }
          : {}),
        section,
        type:
          caughtError instanceof AdminApiError && caughtError.status === 409
            ? "conflict"
            : "invalid",
      });
      requestAnimationFrame(() => {
        const target = form.querySelector<HTMLElement>(
          "[aria-invalid=true], [role=alert]",
        );
        if (target) {
          if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
          target.focus();
        }
      });
    } finally {
      setPending(null);
    }
  }

  function sectionFeedback(section: SourceSettingsSection, title: string) {
    return (
      <>
        <EditorRefreshNotice
          changed={newerSections[section] && dirty[section]}
          onReload={() => reloadSection(section)}
        />
        {error?.section === section && error.type !== "conflict" ? (
          <Alert
            color="red"
            title={title}
            role="alert"
            styles={{ root: { outline: "none" } }}
          >
            {error.message ?? "Check the values and try saving again."}
          </Alert>
        ) : null}
      </>
    );
  }
  function saveAction(section: SourceSettingsSection, label: string) {
    return (
      <SaveBar
        dirty={dirty[section]}
        disabled={pending !== null}
        pending={pending === section}
        label={label}
        saveButtonProps={{ name: "section", value: section }}
      />
    );
  }
  const configurationSection = (
    <SourceConfigurationSection
      renderSection={renderSection}
      title="Configuration"
    >
      <form
        key={sectionRevisions.configuration}
        onSubmit={submit}
        onChange={(event) => updateDirty("configuration", event.currentTarget)}
      >
        <Stack gap="md">
          {sectionFeedback("configuration", "Review the Source settings")}
          <FormFields>
            <TextInput
              inputWrapperOrder={["label", "input", "description", "error"]}
              label="Name"
              defaultValue={source.name}
              id="friendly-name"
              maxLength={120}
              name="name"
              required
              disabled={pending === "configuration"}
              error={
                error?.section === "configuration" && error.type === "conflict"
                  ? "Choose a unique Source name."
                  : undefined
              }
            />
            {!isM2m ? (
              <TextInput
                inputWrapperOrder={["label", "input", "description", "error"]}
                label="Success URL"
                description="HTTPS redirect for HTML submissions, excluding Built-in Forms."
                error={successUrlError}
                defaultValue={source.successUrl ?? ""}
                id="success-url"
                name="successUrl"
                placeholder="https://example.com/thank-you"
                type="url"
                disabled={pending === "configuration"}
              />
            ) : null}
          </FormFields>
          {saveAction("configuration", "Save configuration")}
        </Stack>
      </form>
    </SourceConfigurationSection>
  );
  const advancedSection = (
    <SourceConfigurationSection
      title="Advanced configuration"
      renderSection={renderSection}
    >
      <form
        key={sectionRevisions.advanced}
        onSubmit={submit}
        onChange={(event) => updateDirty("advanced", event.currentTarget)}
      >
        <Stack gap="lg">
          {sectionFeedback("advanced", "Review advanced settings")}
          <FormGroup legend="Retention" disabled={pending === "advanced"}>
            <FormFields>
              <TextInput
                inputWrapperOrder={["label", "input", "description", "error"]}
                label="Submission retention (days)"
                defaultValue={source.retentionDays ?? ""}
                id="retention-days"
                min={1}
                name="retentionDays"
                type="number"
              />
              {sessionEnabled ? (
                <>
                  <TextInput
                    inputWrapperOrder={[
                      "label",
                      "input",
                      "description",
                      "error",
                    ]}
                    label="Expire after inactivity (days)"
                    defaultValue={sessionSettings.inactivityDays}
                    id="session-inactivity"
                    name="sessionInactivityDays"
                    type="number"
                    min={1}
                    max={365}
                    required
                  />
                  <TextInput
                    inputWrapperOrder={[
                      "label",
                      "input",
                      "description",
                      "error",
                    ]}
                    label="Keep completed session answers (days)"
                    defaultValue={sessionSettings.completedRetentionDays}
                    id="session-retention"
                    name="sessionCompletedRetentionDays"
                    type="number"
                    min={1}
                    max={365}
                    required
                  />
                </>
              ) : null}
            </FormFields>
            {sessionEnabled ? (
              <Text size="sm" c="dimmed" mt="sm">
                Session answers and accepted Submissions have separate retention
                periods.
              </Text>
            ) : null}
          </FormGroup>
          <FormGroup legend="Request limits" disabled={pending === "advanced"}>
            <FormFields>
              <TextInput
                inputWrapperOrder={["label", "input", "description", "error"]}
                label="Client and Source requests (per minute)"
                defaultValue={source.submissionRateLimitPerMinute ?? ""}
                id="submission-rate-limit"
                min={1}
                name="submissionRateLimitPerMinute"
                placeholder="Use global limit"
                type="number"
              />
              {!isM2m ? (
                <TextInput
                  inputWrapperOrder={["label", "input", "description", "error"]}
                  label="Challenge rate limit (per minute)"
                  defaultValue={source.challengeRateLimitPerMinute ?? ""}
                  id="challenge-rate-limit"
                  min={1}
                  name="challengeRateLimitPerMinute"
                  placeholder="Use global limit"
                  type="number"
                />
              ) : null}
            </FormFields>
          </FormGroup>
          <FormGroup legend="Payload limits" disabled={pending === "advanced"}>
            <FormFields>
              {(
                [
                  [
                    "maxBodyBytes",
                    "max-body-bytes",
                    "Maximum body bytes",
                    1024,
                  ],
                  ["maxEntries", "max-entries", "Maximum entries", 1],
                  [
                    "maxUniqueKeys",
                    "max-unique-keys",
                    "Maximum unique fields",
                    1,
                  ],
                  [
                    "maxValuesPerKey",
                    "max-values-per-key",
                    "Maximum values per field",
                    1,
                  ],
                  [
                    "maxKeyLength",
                    "max-key-length",
                    "Maximum field-name length",
                    1,
                  ],
                  [
                    "maxValueLength",
                    "max-value-length",
                    "Maximum value length",
                    1,
                  ],
                ] as const
              ).map(([name, id, label, min]) => (
                <TextInput
                  inputWrapperOrder={["label", "input", "description", "error"]}
                  key={name}
                  label={label}
                  defaultValue={source[name]}
                  id={id}
                  min={min}
                  name={name}
                  required
                  type="number"
                />
              ))}
            </FormFields>
          </FormGroup>
          <FormGroup legend="Request metadata" disabled={pending === "advanced"}>
            <Group gap="lg">
              <Checkbox
                label="Store User-Agent"
                defaultChecked={source.storeUserAgent}
                id="store-user-agent"
                name="storeUserAgent"
              />
              <Checkbox
                label="Store Referer"
                defaultChecked={source.storeReferer}
                id="store-referer"
                name="storeReferer"
              />
            </Group>
          </FormGroup>
          {saveAction("advanced", "Save advanced configuration")}
        </Stack>
      </form>
    </SourceConfigurationSection>
  );
  const protectionSection = isM2m ? (
    <SourceConfigurationSection
      renderSection={renderSection}
      title="Protection"
    >
      <Stack gap="sm">
        <Text component="h3" size="sm" fw={500}>
          M2M protection (bearer token)
        </Text>
        <ServerTokenPanel
          sourceId={source.sourceId}
          onTokenChange={onServerTokenChange}
          prefix={source.serverTokenPrefix ?? ""}
        />
      </Stack>
    </SourceConfigurationSection>
  ) : (
    <SourceConfigurationSection
      renderSection={renderSection}
      title="Protection"
    >
      <form
        key={sectionRevisions.protection}
        onSubmit={submit}
        onChange={(event) => updateDirty("protection", event.currentTarget)}
      >
        <Stack gap="lg">
          {sectionFeedback("protection", "Review the protection settings")}
          <FormGroup legend="Allowed origins" disabled={pending === "protection"}>
          <Textarea
            inputWrapperOrder={["label", "input", "description", "error"]}
            label="Authorized domain(s)"
            description="One origin per line. * allows any website. Origin restrictions are not authentication; server-to-server requests require a server token."
            defaultValue={
              source.allowedOrigins.length > 0
                ? source.allowedOrigins.join("\n")
                : "*"
            }
            id="authorized-domains"
            name="allowedOrigins"
            placeholder="https://www.example.test"
            required
            minRows={3}
            autosize
            disabled={pending === "protection"}
            styles={{
              input: { fontFamily: "var(--mantine-font-family-monospace)" },
            }}
          />
          </FormGroup>
          <FormGroup
            legend="Browser protections"
            disabled={pending === "protection"}
          >
            <Stack gap="md">
              <BrowserProtectionFields source={source} />
            </Stack>
          </FormGroup>
          {saveAction("protection", "Save protection")}
        </Stack>
      </form>
    </SourceConfigurationSection>
  );
  const fieldsSection = (
    <SourceConfigurationSection
      renderSection={renderSection}
      title="Source fields"
    >
      <form key={sectionRevisions["source-fields"]} onSubmit={submit}>
        <Stack gap="md">
          {sectionFeedback(
            "source-fields",
            "Review the Source fields definition",
          )}
          <Text size="sm" c="dimmed">
            Without a JSON Schema, all flat fields are accepted.
          </Text>
          <NativeSelect
            label="Templates"
            id="field-template"
            maw={360}
            value=""
            disabled={pending === "source-fields"}
            onChange={(event) => {
              const template = event.target.value as SourceFieldTemplate;
              if (!template) return;
              if (fieldDefinitionSource.trim()) setTemplateToConfirm(template);
              else applyTemplate(template);
            }}
          >
            <option value="" disabled>
              Choose a template
            </option>
            {source.type === "one-shot" ? (
              <>
                <option value="email-only">Email only</option>
                <option value="name-email">Name and email</option>
                <option value="name-email-organization">
                  Name, email and organization
                </option>
                <option value="name-email-organization-note">
                  Name, email, organization and note
                </option>
              </>
            ) : (
              <option value="registration">Registration</option>
            )}
            {sessionEnabled ? (
              <option value="survey">Simple survey</option>
            ) : null}
          </NativeSelect>
          <ConfirmDialog
            opened={templateToConfirm !== null}
            title="Replace field definition?"
            confirmLabel="Replace definition"
            tone="default"
            confirmDisabled={templateToConfirm === "survey" && !sessionEnabled}
            onCancel={() => setTemplateToConfirm(null)}
            onConfirm={() => {
              if (templateToConfirm) applyTemplate(templateToConfirm);
            }}
          >
            Replaces the draft; save Source fields to apply it.
          </ConfirmDialog>
          <Textarea
            inputWrapperOrder={["label", "input", "description", "error"]}
            label="Definition (JSON Schema)"
            id="field-definition"
            spellCheck={false}
            autosize
            minRows={12}
            maxRows={28}
            disabled={pending === "source-fields"}
            styles={{
              input: { fontFamily: "var(--mantine-font-family-monospace)" },
            }}
            onChange={(event) => {
              setFieldDefinitionSource(event.target.value);
              updateFieldsDirty(event.target.value);
            }}
            placeholder={
              '{\n  "type": "object",\n  "properties": {\n    "email": { "type": "string", "format": "email" }\n  },\n  "required": ["email"],\n  "additionalProperties": false\n}'
            }
            value={fieldDefinitionSource}
          />
          {saveAction("source-fields", "Save Source fields")}
        </Stack>
      </form>
    </SourceConfigurationSection>
  );
  return (
    <Stack gap="lg">
      {renderLayout ? (
        renderLayout(
          configurationSection,
          protectionSection,
          fieldsSection,
          advancedSection,
        )
      ) : (
        <>
          {configurationSection}
          {fieldsSection}
          {protectionSection}
          {advancedSection}
        </>
      )}
    </Stack>
  );
}

/**
 * Honeypot names matter only while the honeypot is enabled. The field stays in
 * the form when hidden so saving keeps the configured names.
 */
function BrowserProtectionFields({
  source,
}: {
  source: Pick<
    AdminSourceDetail,
    "altchaEnabled" | "honeypotEnabled" | "honeypotFieldNames"
  >;
}) {
  const [honeypotEnabled, setHoneypotEnabled] = useState(
    source.honeypotEnabled,
  );
  return (
    <>
      <Group gap="lg">
        <Checkbox
          label="Enable ALTCHA"
          defaultChecked={source.altchaEnabled}
          id="altcha-enabled"
          name="altchaEnabled"
        />
        <Checkbox
          label="Enable honeypot"
          defaultChecked={source.honeypotEnabled}
          id="honeypot-enabled"
          name="honeypotEnabled"
          onChange={(event) => setHoneypotEnabled(event.currentTarget.checked)}
        />
      </Group>
      <TextInput
        inputWrapperOrder={["label", "input", "description", "error"]}
        label="Honeypot field names"
        description="Enter 1–10 unique, comma-separated names."
        defaultValue={(
          source.honeypotFieldNames ?? ["forman_company_website"]
        ).join(", ")}
        id="honeypot-field-name"
        name="honeypotFieldNames"
        required={honeypotEnabled}
        display={honeypotEnabled ? undefined : "none"}
      />
    </>
  );
}
