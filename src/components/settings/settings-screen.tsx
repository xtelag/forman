"use client";
import { EditorTabList } from "@/components/patterns/editor-tab-list";
import { formWidth, FormGroup } from "@/components/patterns/form-layout";
import { HelpLabel } from "@/components/patterns/help-tooltip";
import { settingsFormWidth } from "./settings-fields";
import { Box, Tabs } from "@mantine/core";
import { Button, Group, Stack, PasswordInput } from "@mantine/core";
import { ResourceSection } from "@/components/patterns/resource-section";

import {
  confirmDiscardChanges,
  useUnsavedChanges,
} from "@/client/use-unsaved-changes";

import { useEffect, useState } from "react";

import { getSettings, updateSettings } from "@/client/admin-api/settings";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { useAdminResource } from "@/client/use-admin-resource";
import { replaceLocationHash } from "@/client/location-hash";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { BackupSettingsForm } from "@/components/settings/backup-settings-form";
import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";
import { ProtectionSettingsForm } from "@/components/settings/protection-settings-form";
import { RobotsSettingsForm } from "@/components/settings/robots-settings-form";
import { SmtpSettingsForm } from "@/components/settings/smtp-settings-form";
import { TagSettingsForm } from "@/components/settings/tag-settings-form";
import type { AdminSettings } from "@/shared/contracts/admin";

type SettingsScreenProperties = {
  loadSettings?: () => Promise<AdminSettings>;
  passwordError?: boolean;
  saveSettings?: (
    settings: Partial<Omit<AdminSettings, "smtp" | "updatedAt">>,
  ) => Promise<AdminSettings>;
};

function PasswordSection({ passwordError }: { passwordError: boolean }) {
  const [values, setValues] = useState({ confirm: "", current: "", next: "" });
  const dirty = Object.values(values).some(Boolean);
  const releaseDraft = useUnsavedChanges(dirty);
  return (
    <FormGroup legend={<HelpLabel label="Password" help="Changing your password signs you out on all devices." />} id="password">
      {passwordError ? (
        <PageState title="Could not change password" variant="error">
          The current password is incorrect, the new password must contain at
          least 20 characters, or the confirmation does not match.
        </PageState>
      ) : null}
      <Box
        component="form"
        onSubmit={(event) => {
          const restoreDraft = releaseDraft();
          if (!confirmDiscardChanges(true)) {
            event.preventDefault();
            restoreDraft();
          }
        }}
        action="/api/admin/v1/account/password"
        maw={settingsFormWidth}
        method="post"
      >
        <Stack gap="md">
          <PasswordInput
            label="Current password"
            withAsterisk={false}
            autoComplete="current-password"
            id="current-password"
            name="currentPassword"
            onChange={(event) =>
              setValues((currentValues) => ({
                ...currentValues,
                current: event.target.value,
              }))
            }
            required
            value={values.current}
          />
          <PasswordInput
            label="New password (at least 20 characters)"
            withAsterisk={false}
            autoComplete="new-password"
            id="next-password"
            minLength={20}
            name="nextPassword"
            onChange={(event) =>
              setValues((currentValues) => ({
                ...currentValues,
                next: event.target.value,
              }))
            }
            required
            value={values.next}
          />
          <PasswordInput
            label="Confirm new password"
            withAsterisk={false}
            autoComplete="new-password"
            id="confirm-password"
            minLength={20}
            name="confirmPassword"
            onChange={(event) =>
              setValues((currentValues) => ({
                ...currentValues,
                confirm: event.target.value,
              }))
            }
            required
            value={values.confirm}
          />
          <Group justify="flex-end" pt="xs">
            <Button disabled={!dirty} type="submit">
              Change password
            </Button>
          </Group>
        </Stack>
      </Box>
    </FormGroup>
  );
}

export function SettingsScreen({
  loadSettings = getSettings,
  passwordError = false,
  saveSettings = updateSettings,
}: SettingsScreenProperties) {
  const [activeTab, setActiveTab] = useState("account");
  const [visited, setVisited] = useState<string[]>(["account"]);
  function selectTab(value: string | null) {
    if (!value) return;
    setActiveTab(value);
    setVisited((current) =>
      current.includes(value) ? current : [...current, value],
    );
  }
  useEffect(() => {
    const reveal = () => {
      let hash = "";
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const value = [
        "password",
        "current-password",
        "next-password",
        "confirm-password",
      ].includes(hash)
        ? "account"
        : hash;
      if (value === "account" && hash !== "account")
        requestAnimationFrame(() => {
          document.getElementById(hash)?.scrollIntoView?.({ block: "start" });
          if (hash === "password")
            document.getElementById("current-password")?.focus();
        });
      if (
        [
          "account",
          "misc",
          "tags",
          "protection",
          "smtp",
          "backup-and-restore",
          "robots",
        ].includes(value)
      )
        selectTab(value);
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const settings = useAdminResource(loadSettings, undefined, {
    policy: "ambient",
  });
  const header = <PageHeader title="Settings" />;

  if (settings.loading)
    return (
      <PageWorkspace navigationReady={false}>
        {header}
        <AdminResourceNotice resource={settings} />
        <PageState title="Loading settings" variant="loading" />
      </PageWorkspace>
    );
  if (settings.error || !settings.data) {
    return (
      <PageWorkspace>
        {header}
        <AdminResourceNotice resource={settings} />
        <PageState
          action={
            <Button onClick={settings.refresh} type="button">
              Try again
            </Button>
          }
          title="Settings could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  }

  return (
    <PageWorkspace>
      {header}
      <AdminResourceNotice resource={settings} />
      <Tabs
        styles={{ panel: { maxWidth: formWidth } }}
        value={activeTab}
        onChange={(value) => {
          selectTab(value);
          if (value) replaceLocationHash(value);
        }}
        keepMounted
      >
        <EditorTabList label="Settings categories">
            <Tabs.Tab value="account">Account</Tabs.Tab>
            <Tabs.Tab value="tags">Tags</Tabs.Tab>
            <Tabs.Tab value="protection">Protection</Tabs.Tab>
            <Tabs.Tab value="smtp">SMTP</Tabs.Tab>
            <Tabs.Tab value="backup-and-restore">Backup and restore</Tabs.Tab>
            <Tabs.Tab value="robots">Robots</Tabs.Tab>
            <Tabs.Tab value="misc">Misc</Tabs.Tab>
        </EditorTabList>
        <Tabs.Panel value="account">
          <Stack gap="lg">
            <FormGroup
              legend={
                <HelpLabel
                  label="Sign-in"
                  help="You’ll be signed out on the next request if your session has reached either new limit."
                />
              }
            >
              <AccountSettingsForm
                settings={settings.data}
                saveSettings={saveSettings}
              />
            </FormGroup>
            <PasswordSection passwordError={passwordError} />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="misc">
          {visited.includes("misc") ? (
            <ResourceSection title="Misc" hideTitle>
              <GeneralSettingsForm
                settings={settings.data}
                saveSettings={saveSettings}
              />
            </ResourceSection>
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="tags">
          {visited.includes("tags") ? (
            <TagSettingsForm />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="protection">
          {visited.includes("protection") ? (
            <ProtectionSettingsForm
              settings={settings.data}
              saveSettings={saveSettings}
            />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="smtp">
          {visited.includes("smtp") ? (
            <ResourceSection title="SMTP" hideTitle>
              <SmtpSettingsForm
                settings={settings.data.smtp}
                onSaved={settings.refresh}
              />
            </ResourceSection>
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="backup-and-restore">
          {visited.includes("backup-and-restore") ? (
            <BackupSettingsForm />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="robots">
          {visited.includes("robots") ? (
            <RobotsSettingsForm
              settings={settings.data}
              saveSettings={saveSettings}
            />
          ) : null}
        </Tabs.Panel>
      </Tabs>
    </PageWorkspace>
  );
}
