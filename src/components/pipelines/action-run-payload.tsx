"use client";
import { Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { LocalDateTime } from "@/components/patterns/local-date-time";
import { SubmissionPayload } from "@/components/submissions/submission-payload";
import type { StoredSubmissionPayload } from "@/shared/contracts/submission";

type ActionPayload = {
  updatedAt?: string;
  inputPayload: StoredSubmissionPayload;
  outputPayload: StoredSubmissionPayload | null;
  status: string;
  type:
    | "transformation"
    | "webhook"
    | "callback"
    | "callback_boolean"
    | "email"
    | "email_confirmation"
    | "inbox"
    | "couchdb";
};

function hasChangedPayload(
  input: StoredSubmissionPayload,
  output: StoredSubmissionPayload,
) {
  return (
    JSON.stringify(
      Object.entries(input).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ) !==
    JSON.stringify(
      Object.entries(output).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    )
  );
}

function PayloadView({
  label,
  payload,
  updatedAt,
}: {
  updatedAt?: string;
  label: string;
  payload: StoredSubmissionPayload;
}) {
  return (
    <Stack gap={4} miw={0}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={500}>{label}</Text>
        {updatedAt ? <Text size="sm" c="dimmed">Updated <LocalDateTime value={updatedAt} /></Text> : null}
      </Group>
      <SubmissionPayload compact payload={payload} label={label + " JSON"} />
    </Stack>
  );
}

export function ActionRunPayload({ action }: { action: ActionPayload }) {
  const output = action.outputPayload ?? action.inputPayload;
  if (action.type === "inbox" && action.status === "completed")
    return <PayloadView updatedAt={action.updatedAt} label="Stored payload" payload={output} />;
  if (action.type === "email" && action.status === "completed")
    return <PayloadView updatedAt={action.updatedAt} label="Sent payload" payload={output} />;
  if (action.status !== "completed" || !action.outputPayload)
    return <PayloadView updatedAt={action.updatedAt} label="Input payload" payload={action.inputPayload} />;
  if (!hasChangedPayload(action.inputPayload, action.outputPayload)) {
    return (
      <PayloadView updatedAt={action.updatedAt} label="Payload unchanged" payload={action.inputPayload} />
    );
  }
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" miw={0}>
      <PayloadView label="Input payload" payload={action.inputPayload} />
      <PayloadView updatedAt={action.updatedAt} label="Output payload" payload={action.outputPayload} />
    </SimpleGrid>
  );
}
