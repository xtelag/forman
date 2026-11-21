"use client";
import { Box } from "@mantine/core";
import { Divider, Paper, Text, Textarea } from "@mantine/core";

import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import { notifySaved, SaveBar } from "@/components/patterns/save-bar";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { PageState } from "@/components/patterns/page-state";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import type { AdminSettings } from "@/shared/contracts/admin";

type RobotsSettingsSourceProperties = {
  saveSettings: (
    settings: Pick<AdminSettings, "robotsTxt">,
  ) => Promise<AdminSettings>;
  settings: AdminSettings;
};

export function RobotsSettingsForm({
  saveSettings,
  settings,
}: RobotsSettingsSourceProperties) {
  const [robotsTxt, setRobotsTxt] = useState(settings.robotsTxt);
  const [savedRobotsTxt, setSavedRobotsTxt] = useState(settings.robotsTxt);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [newerSettings, setNewerSettings] = useState(false);
  const receivedSettings = useRef(settings.updatedAt);
  const dirty = robotsTxt !== savedRobotsTxt;

  useUnsavedChanges(dirty);

  function acceptSettings() {
    setRobotsTxt(settings.robotsTxt);
    setSavedRobotsTxt(settings.robotsTxt);
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
      await saveSettings({ robotsTxt });
      setSavedRobotsTxt(robotsTxt);
      notifySaved("Robots.txt saved.");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Paper component="form" onSubmit={submit} withBorder radius="md" style={{ overflow: "hidden" }}>
      <Box px="md" py="sm" bg="var(--mantine-color-default-hover)">
        <Text component="label" htmlFor="robots-txt" fw={600} size="sm">robots.txt</Text>
      </Box>
      <Divider />
      <Box p="md">
        <EditorRefreshNotice
          changed={newerSettings && dirty}
          onReload={acceptSettings}
        />
        {error ? (
          <PageState title="Could not save robots.txt" variant="error">
            Try again in a moment.
          </PageState>
        ) : null}
        <Textarea
          aria-label="robots.txt"
          variant="unstyled"
          id="robots-txt"
          onChange={(event) => setRobotsTxt(event.currentTarget.value)}
          minRows={4}
          maxRows={16}
          autosize
          spellCheck={false}
          value={robotsTxt}
          styles={{
            input: { fontFamily: "var(--mantine-font-family-monospace)" },
          }}
        />
      </Box>
      <Divider />
      <Box px="md" pt={4} pb="sm">
        <SaveBar dirty={dirty} pending={pending} label="Save" />
      </Box>
    </Paper>
  );
}
