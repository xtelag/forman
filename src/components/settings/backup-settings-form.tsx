"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { FormGroup } from "@/components/patterns/form-layout";
import { SettingsFields } from "./settings-fields";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";

import {
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
  FileInput,
} from "@mantine/core";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  downloadFullBackup,
  restoreFullBackup,
} from "@/client/admin-api/settings";

type BackupSettingsSourceProperties = {
  downloadBackup?: (password?: string) => Promise<void>;
  onRestored?: () => void;
  restoreBackup?: (file: File, password?: string) => Promise<void>;
};

export function BackupSettingsForm({
  downloadBackup = downloadFullBackup,
  onRestored,
  restoreBackup = restoreFullBackup,
}: BackupSettingsSourceProperties) {
  const router = useRouter();
  const [downloadPassword, setDownloadPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<"download" | "restore" | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restorePassword, setRestorePassword] = useState("");
  const downloadPasswordInvalid =
    downloadPassword.length > 0 && downloadPassword.length < 12;

  async function download() {
    setPending("download");
    setError(null);
    try {
      await downloadBackup(downloadPassword || undefined);
      setDownloadPassword("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Backup could not be downloaded.",
      );
    } finally {
      setPending(null);
    }
  }

  async function restore() {
    if (!file) return;
    setPending("restore");
    setError(null);
    try {
      await restoreBackup(file, restorePassword || undefined);
      setRestorePassword("");
      if (onRestored) onRestored();
      else router.replace("/login");
    } catch (reason) {
      setRestorePassword("");
      setError(
        reason instanceof Error
          ? reason.message
          : "Backup could not be restored.",
      );
    } finally {
      setPending(null);
      setRestoreOpen(false);
    }
  }

  return (
    <Stack gap="lg">
        <FormGroup legend="Download backup">
          <Stack gap="md" h="100%">
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                Includes all data and secrets.
              </Text>
            </Stack>
            <SettingsFields>
              <Stack gap="xs">
                <PasswordInput
                  label="Password (optional, 12+ characters)"
                  autoComplete="new-password"
                  id="backup-export-password"
                  minLength={12}
                  onChange={(event) => setDownloadPassword(event.currentTarget.value)}
                  value={downloadPassword}
                  disabled={pending !== null}
                />
              </Stack>
            </SettingsFields>
            <Group justify="flex-end">
              <Button
                disabled={downloadPasswordInvalid || pending !== null}
                loading={pending === "download"}
                onClick={() => void download()}
                type="button"
                leftSection={<Download size={16} />}
              >
                {pending === "download" ? "Preparing…" : "Download backup"}
              </Button>
            </Group>
          </Stack>
        </FormGroup>
        <FormGroup legend="Restore backup">
          <Stack gap="md" h="100%">
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                Replaces current data and settings.
              </Text>
            </Stack>
            <SettingsFields>
            <PasswordInput
              label="Password (if encrypted)"
              autoComplete="current-password"
              id="backup-restore-password"
              onChange={(event) =>
                setRestorePassword(event.currentTarget.value)
              }
              value={restorePassword}
              disabled={pending !== null}
            />
            <FileInput
              label="Backup file"
              placeholder="Choose backup file"
              fileInputProps={{ "aria-label": "Upload backup file" }}
              value={file}
              clearable
              accept=".sqlite,.forman-backup"
              id="backup-file"
              onChange={setFile}
              disabled={pending !== null}
            />
            </SettingsFields>
            <Group justify="flex-end">
              <Button
                disabled={!file || pending !== null}
                onClick={() => setRestoreOpen(true)}
                type="button"
                variant="default"
                leftSection={<Upload size={16} />}
              >
                Restore backup
              </Button>
            </Group>
          </Stack>
        </FormGroup>

      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      <ConfirmDialog
        opened={restoreOpen}
        title="Restore backup?"
        confirmLabel="Restore backup"
        pendingLabel="Restoring…"
        pending={pending === "restore"}
        onCancel={() => setRestoreOpen(false)}
        onConfirm={() => void restore()}
      >
        <p style={{ margin: 0 }}>
          Permanently replaces all current data.
        </p>
        <p style={{ marginBottom: 0 }}>
          Keeps administrator credentials, signs everyone out and disables restored Pipelines.
        </p>
      </ConfirmDialog>
    </Stack>
  );
}
