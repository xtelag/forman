"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  RotateCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getServerToken,
  regenerateServerToken,
} from "@/client/admin-api/sources";
import {
  ActionIcon,
  Group,
  Stack,
  TextInput,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";

type TokenPayload = { prefix: string; token: string };

type ServerTokenPanelProperties = {
  sourceId: string;
  getToken?: (sourceId: string) => Promise<TokenPayload>;
  onTokenChange?: (token: string | null) => void;
  prefix: string;
  regenerateToken?: (sourceId: string) => Promise<TokenPayload>;
  writeToClipboard?: (value: string) => Promise<void>;
};

export function ServerTokenPanel({
  sourceId,
  getToken = getServerToken,
  onTokenChange,
  prefix,
  regenerateToken = regenerateServerToken,
  writeToClipboard = (value) => navigator.clipboard.writeText(value),
}: ServerTokenPanelProperties) {
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenPrefix, setTokenPrefix] = useState(prefix);

  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    [],
  );

  async function showToken() {
    if (token) {
      setToken(null);
      onTokenChange?.(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const payload = await getToken(sourceId);
      setToken(payload.token);
      onTokenChange?.(payload.token);
      setTokenPrefix(payload.prefix);
      setCopyStatus(null);
    } catch {
      setError(
        "The token could not be displayed. Refresh the page and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    try {
      await writeToClipboard(token);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    copyResetTimer.current = setTimeout(() => setCopyStatus(null), 2_000);
  }

  async function confirmRegeneration() {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await regenerateToken(sourceId);
      setToken(payload.token);
      onTokenChange?.(payload.token);
      setTokenPrefix(payload.prefix);
      setCopyStatus(null);
      setRegenerateOpen(false);
    } catch {
      setError(
        "The token could not be regenerated. Refresh the page and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Stack gap="sm" role="group" aria-label="Machine-to-machine token">
        <TextInput
          aria-label="Machine-to-machine token value"
          readOnly
          value={token ?? tokenPrefix + "…"}
          styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
          leftSectionPointerEvents="all"
          rightSectionPointerEvents="all"
          rightSectionWidth={token ? 76 : 40}
          leftSection={
            <Tooltip
              label={token ? "Hide token" : "Show token"}
              events={{ hover: true, focus: true, touch: true }}
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={token ? "Hide token" : "Show token"}
                disabled={isLoading}
                onClick={showToken}
              >
                {token ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </ActionIcon>
            </Tooltip>
          }
          rightSection={
            <Group gap={4} wrap="nowrap">
              {token ? (
                <Tooltip
                  label={copyStatus === "copied" ? "Copied" : "Copy token"}
                  events={{ hover: true, focus: true, touch: true }}
                >
                  <ActionIcon
                    aria-label="Copy token"
                    color={copyStatus === "copied" ? "green" : "gray"}
                    variant={copyStatus === "copied" ? "light" : "subtle"}
                    disabled={isLoading}
                    onClick={copyToken}
                  >
                    {copyStatus === "copied" ? (
                      <CheckIcon size={16} />
                    ) : (
                      <CopyIcon size={16} />
                    )}
                  </ActionIcon>
                </Tooltip>
              ) : null}
              <Tooltip
                label="Regenerate token"
                events={{ hover: true, focus: true, touch: true }}
              >
                <ActionIcon
                  aria-label="Regenerate token"
                  color="gray"
                  variant="subtle"
                  disabled={isLoading}
                  onClick={() => {
                    setError(null);
                    setRegenerateOpen(true);
                  }}
                >
                  <RotateCw size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          }
        />
        {copyStatus ? (
          <VisuallyHidden role="status">
            {copyStatus === "copied"
              ? "Copied token."
              : "Could not copy token."}
          </VisuallyHidden>
        ) : null}
        {error && !regenerateOpen ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
      </Stack>
      <ConfirmDialog
        opened={regenerateOpen}
        title="Regenerate machine-to-machine token?"
        confirmLabel="Regenerate token"
        pendingLabel="Regenerating…"
        pending={isLoading}
        error={error}
        size="lg"
        onCancel={() => setRegenerateOpen(false)}
        onConfirm={() => void confirmRegeneration()}
      >
        Revokes the current token immediately; update all M2M integrations before sending Submissions.
      </ConfirmDialog>
    </>
  );
}
