"use client";
import { HelpLabel, HelpTooltip } from "@/components/patterns/help-tooltip";
import { SettingsFields } from "./settings-fields";
import { FormGroup } from "@/components/patterns/form-layout";
import { Box } from "@mantine/core";
import { Checkbox, Group, Stack, TextInput } from "@mantine/core";

import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import { notifySaved, SaveBar } from "@/components/patterns/save-bar";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { PageState } from "@/components/patterns/page-state";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import type { AdminSettings } from "@/shared/contracts/admin";

type EditableSettings = Omit<AdminSettings, "smtp" | "updatedAt">;
type ProtectionSettings = Omit<
  EditableSettings,
  "formspreeCompatibilityEndpointEnabled"
>;
type NumericProtectionSetting = Exclude<
  keyof ProtectionSettings,
  "webhookSsrfProtectionEnabled"
>;
type ProtectionSourceValues = Record<NumericProtectionSetting, string> & {
  webhookSsrfProtectionEnabled: boolean;
};

type ProtectionSettingsSourceProperties = {
  saveSettings: (settings: Partial<ProtectionSettings>) => Promise<AdminSettings>;
  settings: AdminSettings;
};

const fields: Array<{
  label: string;
  name: NumericProtectionSetting;
  help?: string;
}> = [
  {
    label: "Submission rate limit (per minute)",
    name: "submissionRateLimitPerMinute",
  },
  { label: "Client rate limit (per minute)", name: "clientRateLimitPerMinute" },
  { label: "Source rate limit (per minute)", name: "sourceRateLimitPerMinute" },
  {
    label: "Client burst limit",
    name: "clientBurstLimit",
    help: "Maximum requests per client in a 10-second window, in addition to the per-minute limits.",
  },
  {
    label: "Challenge rate limit (per minute)",
    name: "challengeRateLimitPerMinute",
  },
  { label: "Login failure limit", name: "loginFailureLimit" },
  {
    label: "Login failure window (seconds)",
    name: "loginFailureWindowSeconds",
  },
  { label: "Challenge lifetime (seconds)", name: "challengeTtlSeconds" },
  {
    label: "ALTCHA work factor",
    name: "altchaMaxNumber",
    help: "Controls the work needed to solve an ALTCHA challenge. Higher values require more computation in the visitor’s browser.",
  },
  {
    label: "Rate limiter capacity",
    name: "rateLimiterCapacity",
    help: "Maximum number of rate-limit counters held in memory per limiter. When full, the oldest counter is evicted.",
  },
  {
    label: "Rate limiter TTL (seconds)",
    name: "rateLimiterTtlSeconds",
    help: "How long a counter is retained after its last accepted request. Individual rate limits use their own time windows.",
  },
];

function createSourceValues(settings: AdminSettings): ProtectionSourceValues {
  return {
    ...fields.reduce<Record<NumericProtectionSetting, string>>(
      (values, field) => ({
        ...values,
        [field.name]: String(settings[field.name]),
      }),
      {} as Record<NumericProtectionSetting, string>,
    ),
    webhookSsrfProtectionEnabled: settings.webhookSsrfProtectionEnabled,
  };
}

function toSettings(values: ProtectionSourceValues): ProtectionSettings {
  return {
    ...fields.reduce<ProtectionSettings>(
      (settings, field) => ({
        ...settings,
        [field.name]: Number(values[field.name]),
      }),
      {} as ProtectionSettings,
    ),
    webhookSsrfProtectionEnabled: values.webhookSsrfProtectionEnabled,
  };
}

const sections: Array<{ title: string; names: NumericProtectionSetting[]; webhook?: boolean }> = [
  { title: "Submission limits", names: ["submissionRateLimitPerMinute", "clientRateLimitPerMinute", "sourceRateLimitPerMinute", "clientBurstLimit"] },
  { title: "Login protection", names: ["loginFailureLimit", "loginFailureWindowSeconds"] },
  { title: "ALTCHA", names: ["challengeRateLimitPerMinute", "challengeTtlSeconds", "altchaMaxNumber"] },
  { title: "Rate limiter", names: ["rateLimiterCapacity", "rateLimiterTtlSeconds"] },
  { title: "Webhook protection", names: [], webhook: true },
];

export function ProtectionSettingsForm(props: ProtectionSettingsSourceProperties) {
  return (
    <Stack gap="lg">
      {sections.map((section) => (
        <FormGroup key={section.title} legend={section.title}>
          <ProtectionSectionForm {...props} {...section} />
        </FormGroup>
      ))}
    </Stack>
  );
}

function ProtectionSectionForm({
  saveSettings,
  settings,
  title,
  names,
  webhook = false,
}: ProtectionSettingsSourceProperties & { title: string; names: NumericProtectionSetting[]; webhook?: boolean }) {
  const [values, setValues] = useState(() => createSourceValues(settings));
  const [savedValues, setSavedValues] = useState(() =>
    createSourceValues(settings),
  );
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [newerSettings, setNewerSettings] = useState(false);
  const receivedSettings = useRef(settings.updatedAt);
  const dirty =
    names.some((name) => values[name] !== savedValues[name]) ||
    (webhook && values.webhookSsrfProtectionEnabled !== savedValues.webhookSsrfProtectionEnabled);

  useUnsavedChanges(dirty);

  function acceptSettings() {
    const next = createSourceValues(settings);
    setValues(next);
    setSavedValues(next);
    setNewerSettings(false);
  }

  useEffect(() => {
    if (receivedSettings.current === settings.updatedAt) return;
    receivedSettings.current = settings.updatedAt;
    queueMicrotask(() => {
      if (dirty) setNewerSettings(true);
      else acceptSettings();
    });
    // Form state is intentionally the local save boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, settings]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    setPending(true);
    try {
      const converted = toSettings(values);
      const patch = webhook
        ? { webhookSsrfProtectionEnabled: converted.webhookSsrfProtectionEnabled }
        : Object.fromEntries(names.map((name) => [name, converted[name]]));
      await saveSettings(patch);
      setSavedValues(values);
      notifySaved(title + " saved.");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit}>
      <Stack gap="md">
        <EditorRefreshNotice
          changed={newerSettings && dirty}
          onReload={acceptSettings}
        />
        {error ? (
          <PageState title="Could not save protection settings" variant="error">
            One or more protection values are outside their allowed range.
          </PageState>
        ) : null}
        {names.length > 0 ? (
            <SettingsFields>
              {fields
                .filter((field) => names.includes(field.name))
                .map((field) => (
                  <TextInput
                    key={field.name}
                    disabled={pending}
                    label={
                      field.help ? (
                        <HelpLabel
                          htmlFor={field.name}
                          label={field.label}
                          help={field.help}
                        />
                      ) : (
                        field.label
                      )
                    }
                    labelProps={{
                      component: field.help ? "div" : "label",
                      mih: { base: 20, md: 28 },
                      style: { display: "flex", alignItems: "center" },
                    }}
                    aria-label={field.label}
                    id={field.name}
                    min="1"
                    name={field.name}
                    required
                    withAsterisk={false}
                    type="number"
                    value={values[field.name]}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setValues((current) => ({
                        ...current,
                        [field.name]: value,
                      }));
                    }}
                  />
                ))}
            </SettingsFields>
        ) : null}
        {webhook ? (
        <Group gap={4} wrap="nowrap">
        <Checkbox
          disabled={pending}
          label="Block webhooks to private networks"
          checked={values.webhookSsrfProtectionEnabled}
          name="webhookSsrfProtectionEnabled"
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setValues((current) => ({
              ...current,
              webhookSsrfProtectionEnabled: checked,
            }));
          }}
        />
        <HelpTooltip label="About blocking webhooks to private networks">
          Prevents webhook requests to localhost, private networks and reserved IP addresses (SSRF protection). Disable only when your Pipelines need to call trusted internal services.
        </HelpTooltip>
        </Group>
        ) : null}
        <SaveBar
          dirty={dirty}
          pending={pending}
          label="Save"
        />
      </Stack>
    </Box>
  );
}
