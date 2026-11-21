"use client";
import { Code } from "@mantine/core";
export function SubmissionPayload({
  payload,
  compact = false,
  label = "Payload JSON",
}: {
  payload: unknown;
  compact?: boolean;
  label?: string;
}) {
  return (
    <Code
      block
      tabIndex={0}
      aria-label={label}
      p={compact ? "xs" : "md"}
      miw={0}
      maw="100%"
      style={{ overflowX: "auto", whiteSpace: "pre", lineHeight: compact ? 1.4 : 1.6 }}
    >
      <code>{JSON.stringify(payload, null, 2)}</code>
    </Code>
  );
}
