"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { SettingsFields, settingsFormWidth } from "./settings-fields";
import { HelpLabel } from "@/components/patterns/help-tooltip";
import { toast } from "sonner";
import { Box } from "@mantine/core";
import {
  Button,
  Group,
  Input,
  Modal,
  PasswordInput,
  Radio,
  Stack,
  Checkbox,
  Text,
  TextInput,
} from "@mantine/core";

import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import { notifySaved, SaveBar } from "@/components/patterns/save-bar";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  sendSmtpTestEmail,
  updateSmtpSettings,
  type SmtpSettingsInput,
} from "@/client/admin-api/settings";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import type { AdminSmtpSettings } from "@/shared/contracts/admin";

const smtpLabelProps = { mih: { base: 20, md: 28 }, style: { display: "flex", alignItems: "center" } } as const;

export function SmtpSettingsForm({
  onSaved,
  settings,
}: {
  onSaved: () => void;
  settings: AdminSmtpSettings;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [authentication, setAuthentication] = useState(settings.authentication !== false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [newerSettings, setNewerSettings] = useState(false);
  const [revision, setRevision] = useState(0);
  const receivedSettings = useRef(JSON.stringify(settings));
  useUnsavedChanges(dirty);

  const acceptSettings = useCallback(() => {
    setAuthentication(settings.authentication !== false);
    setDirty(false);
    setNewerSettings(false);
    setRevision((current) => current + 1);
  }, [settings.authentication]);
  useEffect(() => {
    const signature = JSON.stringify(settings);
    if (receivedSettings.current === signature) return;
    receivedSettings.current = signature;
    queueMicrotask(() => {
      if (dirty) setNewerSettings(true);
      else acceptSettings();
    }); // Form state is intentionally the local save boundary.
  }, [dirty, settings, acceptSettings]);
  function smtpValues(form: HTMLFormElement): SmtpSettingsInput {
    const values = new FormData(form);
    const password = String(values.get("password") ?? "");
    return {
      authentication,
      from: String(values.get("from")),
      fromName: String(values.get("fromName") ?? ""),
      host: String(values.get("host")),
      ...(password ? { password } : {}),
      port: Number(values.get("port")),
      encryption: String(
        values.get("encryption"),
      ) as SmtpSettingsInput["encryption"],
      username: authentication ? String(values.get("username") ?? "") : undefined,
    };
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await updateSmtpSettings(smtpValues(event.currentTarget));
      setDirty(false);
      notifySaved("SMTP settings saved.");
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "SMTP settings could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }
  function openTestEmail() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setError(null);
    setTestRecipient("");
    setTestOpen(true);
  }
  async function sendTestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const to = String(new FormData(event.currentTarget).get("to"));
    setPending(true);
    setError(null);
    try {
      await sendSmtpTestEmail({ smtp: smtpValues(form), to });
      setTestOpen(false);
      toast.success("Test email sent.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "SMTP test email could not be sent.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Box
        component="form"
        maw={settingsFormWidth}
        key={revision}
        onInput={() => setDirty(true)}
        onSubmit={save}
        ref={formRef}
      >
        <Stack gap="md">
          <EditorRefreshNotice
            changed={newerSettings && dirty}
            onReload={acceptSettings}
          />
          <SettingsFields>
            <TextInput
              labelProps={smtpLabelProps}
              label="Host"
              defaultValue={settings.host ?? ""}
              id="smtp-host"
              name="host"
              required
              withAsterisk={false}
              disabled={pending}
            />
            <TextInput
              labelProps={smtpLabelProps}
              label="Port"
              defaultValue={settings.port ?? 465}
              id="smtp-port"
              min="1"
              max="65535"
              name="port"
              required
              withAsterisk={false}
              disabled={pending}
              type="number"
            />
            <Radio.Group
              label="Encryption"
              name="encryption"
              defaultValue={settings.encryption}
              onChange={(mode) => {
                const ports = { tls: 465, starttls: 587, none: 25 };
                const input = formRef.current?.elements.namedItem(
                  "port",
                ) as HTMLInputElement | null;
                if (input)
                  input.value = String(ports[mode as keyof typeof ports]);
                setDirty(true);
              }}
            >
              <Group mt="xs" gap="md">
                {(
                  [
                    ["tls", "TLS"],
                    ["starttls", "STARTTLS"],
                    ["none", "None"],
                  ] as const
                ).map(([value, label]) => (
                  <Radio
                    disabled={pending}
                    value={value}
                    label={label}
                    key={value}
                  />
                ))}
              </Group>
            </Radio.Group>
            <Stack gap="xs">
              <Input.Label htmlFor="smtp-authentication">Authentication</Input.Label>
              <Checkbox id="smtp-authentication" aria-label="Authentication" label="Use authentication"
                checked={authentication} disabled={pending}
                onChange={(event) => { setAuthentication(event.currentTarget.checked); setDirty(true); }} />
            </Stack>
          </SettingsFields>
          <Box display={authentication ? undefined : "none"}>
          <SettingsFields>
            <TextInput
              labelProps={smtpLabelProps}
              label="Username"
              defaultValue={settings.username ?? ""}
              id="smtp-username"
              name="username"
              required={authentication}
              withAsterisk={false}
              disabled={pending || !authentication}
              autoComplete="off"
            />
            <PasswordInput
              label={<HelpLabel htmlFor="smtp-password" label="Password" help={settings.passwordConfigured ? "Leave blank to keep the saved password." : "A password is required for SMTP setup."} />}
              labelProps={{ ...smtpLabelProps, component: "div" }}
              aria-label="Password"
              id="smtp-password"
              name="password"
              autoComplete="new-password"
              required={authentication && !settings.passwordConfigured}
              withAsterisk={false}
              disabled={pending || !authentication}
            />
          </SettingsFields>
          </Box>
          <SettingsFields>
            <TextInput
              labelProps={smtpLabelProps}
              label="From address"
              defaultValue={settings.from ?? ""}
              id="smtp-from"
              name="from"
              required
              withAsterisk={false}
              disabled={pending}
              type="email"
            />
            <TextInput
              labelProps={smtpLabelProps}
              label="From name (optional)"
              defaultValue={settings.fromName ?? ""}
              id="smtp-from-name"
              name="fromName"
              maxLength={200}
              disabled={pending}
            />
          </SettingsFields>
          {error && !testOpen ? (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          ) : null}
          <SaveBar
            dirty={dirty}
            pending={pending && !testOpen}
            disabled={pending}
            label="Save SMTP settings"
          >
            <Button
              disabled={pending}
              onClick={openTestEmail}
              type="button"
              variant="default"
            >
              Send test email
            </Button>
          </SaveBar>
        </Stack>
      </Box>
      <Modal
        opened={testOpen}
        onClose={() => {
          if (!pending) setTestOpen(false);
        }}
        title="Send SMTP test email"
        centered
        closeOnClickOutside={!pending}
        closeOnEscape={!pending}
        withCloseButton={!pending}
      >
        <Box component="form" onSubmit={sendTestEmail}>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Uses the SMTP settings currently entered in the form.
            </Text>
            <TextInput
              label="Recipient email"
              placeholder="you@example.com"
              id="smtp-test-recipient"
              name="to"
              onChange={(event) => setTestRecipient(event.currentTarget.value)}
              required
              withAsterisk={false}
              disabled={pending}
              type="email"
              value={testRecipient}
            />
            {error ? (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            ) : null}
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => setTestOpen(false)}
                disabled={pending}
                type="button"
              >
                Cancel
              </Button>
              <Button disabled={pending} loading={pending} type="submit">
                {pending ? "Sending…" : "Send test email"}
              </Button>
            </Group>
          </Stack>
        </Box>
      </Modal>
    </>
  );
}
