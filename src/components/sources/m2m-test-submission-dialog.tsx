"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import { useId, useState } from "react";

import { sendTestSubmission } from "@/client/admin-api/sources";
import { AppLink } from "@/components/layout/app-link";
import {
  Anchor,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";

const examplePayload = JSON.stringify(
  {
    email: "john.forman@example.com",
    name: "John Forman",
    note: "Hello from my website.",
  },
  null,
  2,
);

export function M2mTestSubmissionDialog({ sourceId }: { sourceId: string }) {
  const descriptionId = useId();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(examplePayload);
  const [sending, setSending] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  async function submit() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("Enter valid JSON before sending the test Submission.");
      return;
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      setError("The test Submission must be a JSON object.");
      return;
    }

    setSending(true);
    try {
      const result = await sendTestSubmission(
        sourceId,
        parsed as Record<string, unknown>,
      );
      setSubmissionId(result.submissionId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The test Submission could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  function onOpenChange(nextOpen: boolean) {
    if (sending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      setSubmissionId(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="default"
        onClick={() => onOpenChange(true)}
      >
        Send test Submission
      </Button>
      <Modal
        opened={open}
        onClose={() => onOpenChange(false)}
        title="Send test Submission"
        aria-describedby={descriptionId}
        size="lg"
        centered
        closeOnEscape={!sending}
        closeOnClickOutside={!sending}
        withCloseButton={!sending}
      >
        <Stack gap="md">
          <Text id={descriptionId} size="sm" c="dimmed">
            Send an editable JSON payload through this Source’s
            machine-to-machine integration.
          </Text>
          {submissionId ? (
            <Alert color="green" role="status">
              Test Submission created.{" "}
              <Anchor
                component={AppLink}
                href={"/app/submissions/" + submissionId}
                inherit
              >
                View Submission
              </Anchor>
            </Alert>
          ) : (
            <>
              <Alert color="yellow" role="note" data-variant="warning">
                This creates a real Submission using the current
                machine-to-machine token.
              </Alert>
              <Textarea
                label="JSON payload"
                id="m2m-test-payload"
                autosize
                minRows={9}
                maxRows={18}
                disabled={sending}
                onChange={(event) => setPayload(event.target.value)}
                value={payload}
                error={error ? <span role="alert">{error}</span> : undefined}
                styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
              />
            </>
          )}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              disabled={sending}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {!submissionId && (
              <Button disabled={sending} onClick={submit} type="button">
                {sending ? "Sending…" : "Send test Submission"}
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
