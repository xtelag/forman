"use client";
import { Group } from "@mantine/core";
import { HelpLabel, HelpTooltip } from "@/components/patterns/help-tooltip";
import { SettingsFields, settingsFormWidth } from "./settings-fields";
import { Box } from "@mantine/core";
import { Checkbox, Stack, TextInput } from "@mantine/core";

import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import { notifySaved, SaveBar } from "@/components/patterns/save-bar";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { PageState } from "@/components/patterns/page-state";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import type { AdminSettings } from "@/shared/contracts/admin";

type GeneralSettingsSourceProperties = {
  saveSettings: (
    settings: Pick<
      AdminSettings,
      | "failedActionRetentionDays"
      | "formspreeCompatibilityEndpointEnabled"
      | "inboxRetentionDays"
    >,
  ) => Promise<AdminSettings>;
  settings: AdminSettings;
};

export function GeneralSettingsForm({
  saveSettings,
  settings,
}: GeneralSettingsSourceProperties) {
  const [enabled, setEnabled] = useState(
    settings.formspreeCompatibilityEndpointEnabled,
  );
  const [savedEnabled, setSavedEnabled] = useState(
    settings.formspreeCompatibilityEndpointEnabled,
  );
  const [retentionDays, setRetentionDays] = useState(
    settings.failedActionRetentionDays,
  );
  const [savedRetentionDays, setSavedRetentionDays] = useState(
    settings.failedActionRetentionDays,
  );
  const [inboxRetentionDays, setInboxRetentionDays] = useState(
    settings.inboxRetentionDays,
  );
  const [savedInboxRetentionDays, setSavedInboxRetentionDays] = useState(
    settings.inboxRetentionDays,
  );
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [newerSettings, setNewerSettings] = useState(false);
  const receivedSettings = useRef(settings.updatedAt);
  const dirty =
    enabled !== savedEnabled ||
    retentionDays !== savedRetentionDays ||
    inboxRetentionDays !== savedInboxRetentionDays;

  useUnsavedChanges(dirty);

  function acceptSettings() {
    setEnabled(settings.formspreeCompatibilityEndpointEnabled);
    setSavedEnabled(settings.formspreeCompatibilityEndpointEnabled);
    setRetentionDays(settings.failedActionRetentionDays);
    setSavedRetentionDays(settings.failedActionRetentionDays);
    setInboxRetentionDays(settings.inboxRetentionDays);
    setSavedInboxRetentionDays(settings.inboxRetentionDays);
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
      await saveSettings({
        failedActionRetentionDays: retentionDays,
        formspreeCompatibilityEndpointEnabled: enabled,
        inboxRetentionDays,
      });
      setSavedEnabled(enabled);
      setSavedRetentionDays(retentionDays);
      setSavedInboxRetentionDays(inboxRetentionDays);
      notifySaved("Misc settings saved.");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} maw={settingsFormWidth}>
      <Stack gap="md">
        <EditorRefreshNotice
          changed={newerSettings && dirty}
          onReload={acceptSettings}
        />
        {error ? (
          <PageState title="Could not save misc settings" variant="error">
            Try again in a moment.
          </PageState>
        ) : null}
        <Group gap={4} wrap="nowrap">
          <Checkbox
            label="Enable Submission endpoint alias"
            checked={enabled}
            name="formspreeCompatibilityEndpointEnabled"
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
          <HelpTooltip label="About Enable Submission endpoint alias">
            Adds /f/SOURCE_ID as an alias for /api/submit/SOURCE_ID.
          </HelpTooltip>
        </Group>
        <SettingsFields>
          <TextInput
            label={<HelpLabel label="Failed Action retention (days)" htmlFor="failed-action-retention-days" help="Permanently delete older failed Action runs." />}
            labelProps={{ component: "div" }}
            aria-label="Failed Action retention (days)"
            id="failed-action-retention-days"
            min={1}
            required
            withAsterisk={false}
            onChange={(event) =>
              setRetentionDays(Number(event.currentTarget.value))
            }
            type="number"
            value={retentionDays}
          />
          <TextInput
            label={<HelpLabel label="Inbox retention (days)" htmlFor="inbox-retention-days" help="Moves older items to Trash for manual deletion." />}
            labelProps={{ component: "div" }}
            aria-label="Inbox retention (days)"
            id="inbox-retention-days"
            min={1}
            required
            withAsterisk={false}
            onChange={(event) =>
              setInboxRetentionDays(Number(event.currentTarget.value))
            }
            type="number"
            value={inboxRetentionDays}
          />
        </SettingsFields>
        <SaveBar
          dirty={dirty}
          pending={pending}
          label="Save misc settings"
        />
      </Stack>
    </Box>
  );
}
