"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { SettingsFields, settingsFormWidth } from "./settings-fields";
import { Box, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import { notifySaved, SaveBar } from "@/components/patterns/save-bar";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import type { AdminSettings } from "@/shared/contracts/admin";
type Limits = Pick<
  AdminSettings,
  "adminSessionIdleDays" | "adminSessionAbsoluteDays"
>;
const read = (settings: AdminSettings): Limits => ({
  adminSessionIdleDays: settings.adminSessionIdleDays,
  adminSessionAbsoluteDays: settings.adminSessionAbsoluteDays,
});
export function AccountSettingsForm({
  settings,
  saveSettings,
}: {
  settings: AdminSettings;
  saveSettings: (values: Limits) => Promise<AdminSettings>;
}) {
  const [values, setValues] = useState(() => read(settings));
  const [baseline, setBaseline] = useState(() => read(settings));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [newer, setNewer] = useState(false);
  const received = useRef(settings.updatedAt);
  const dirty =
    values.adminSessionIdleDays !== baseline.adminSessionIdleDays ||
    values.adminSessionAbsoluteDays !== baseline.adminSessionAbsoluteDays;
  const valid =
    Object.values(values).every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 365,
    ) && values.adminSessionIdleDays <= values.adminSessionAbsoluteDays;
  useUnsavedChanges(dirty);
  function acceptSettings() {
    setValues(read(settings));
    setBaseline(read(settings));
    setNewer(false);
  }
  useEffect(() => {
    if (received.current === settings.updatedAt) return;
    received.current = settings.updatedAt;
    queueMicrotask(() => {
      if (dirty) setNewer(true);
      else acceptSettings();
    });
    // Keep local drafts intact when settings refresh in the background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, dirty]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError(false);
    try {
      const result = await saveSettings(values);
      setBaseline(read(result));
      setValues(read(result));
      notifySaved("Sign-in settings saved.");
      setNewer(false);
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
          changed={newer && dirty}
          onReload={acceptSettings}
        />
        <SettingsFields>
          <TextInput
            label="Sign out after inactivity (days)"
            type="number"
            min={1}
            max={365}
            step={1}
            required
            withAsterisk={false}
            disabled={pending}
            value={values.adminSessionIdleDays}
            onChange={(event) => {
              setValues({
                ...values,
                adminSessionIdleDays: Number(event.currentTarget.value),
              });
            }}
          />
          <TextInput
            label="Maximum sign-in lifetime (days)"
            type="number"
            min={1}
            max={365}
            step={1}
            required
            withAsterisk={false}
            disabled={pending}
            value={values.adminSessionAbsoluteDays}
            onChange={(event) => {
              setValues({
                ...values,
                adminSessionAbsoluteDays: Number(event.currentTarget.value),
              });
            }}
          />
        </SettingsFields>
        {!valid ? (
          <Text c="red" size="sm" role="alert">
            Use whole days from 1 to 365. Inactivity cannot exceed the maximum
            lifetime.
          </Text>
        ) : null}
        {error ? (
          <Alert color="red" role="alert">
            Could not save sign-in settings. Please try again.
          </Alert>
        ) : null}
        <SaveBar
          dirty={dirty}
          disabled={!valid}
          pending={pending}
          label="Save sign-in settings"
        />
      </Stack>
    </Box>
  );
}
