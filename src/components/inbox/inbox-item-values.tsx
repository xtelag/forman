"use client";
import { useState } from "react";
import { DataViewControl, type DataView } from "@/components/patterns/data-view-control";
import { SubmissionPayload } from "@/components/submissions/submission-payload";
import { DetailRow } from "@/components/patterns/detail-row";

import {
  Badge,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { DetailDisclosure } from "@/components/patterns/detail-disclosure";
import { ResourceSection } from "@/components/patterns/resource-section";
import { LocalDateTime } from "@/components/patterns/local-date-time";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldLabel(name: string) {
  const words = name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (["id", "ip", "url", "uuid"].includes(lower))
        return lower.toUpperCase();
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function isDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function ScalarValue({ value }: { value: boolean | null | number | string }) {
  if (value === null || value === "") {
    return (
      <Text component="span" c="dimmed">
        —
      </Text>
    );
  }

  if (typeof value === "boolean") {
    return (
      <Badge color="gray" variant="light" radius="sm" tt="none" fw={500}>
        {value ? "Yes" : "No"}
      </Badge>
    );
  }

  if (typeof value === "string" && isDateValue(value)) {
    return <LocalDateTime value={value} />;
  }

  return (
    <Text
      component="span"
      inherit
      style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
    >
      {String(value)}
    </Text>
  );
}

export function ReadableValue({
  compact = false,
  value,
}: {
  compact?: boolean;
  value: unknown;
}) {
  if (Array.isArray(value)) {
    if (value.length === 0)
      return (
        <Text component="span" c="dimmed">
          —
        </Text>
      );

    return (
      <Stack
        component="ul"
        gap="sm"
        m={0}
        p={0}
        miw={0}
        style={{ listStyle: "none" }}
      >
        {value.map((item, index) => (
          <Paper
            component="li"
            withBorder
            p={{ base: "xs", sm: "sm" }}
            miw={0}
            key={index}
          >
            <ReadableValue value={item} />
          </Paper>
        ))}
      </Stack>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0)
      return (
        <Text component="span" c="dimmed">
          —
        </Text>
      );

    return (
      <Stack
        component="dl"
        gap="sm"
        m={0}
        miw={0}
        style={{ overflowWrap: "anywhere" }}
      >
        {entries.map(([name, item]) => {
          const complex = Array.isArray(item) || isRecord(item);
          return (
            <DetailRow label={fieldLabel(name)} key={name}>
              {complex ? (
                <Paper withBorder={!Array.isArray(item)}
                  p={Array.isArray(item) ? 0 : { base: "xs", sm: "md" }} miw={0}>
                  <ReadableValue compact={compact} value={item} />
                </Paper>
              ) : <ReadableValue compact={compact} value={item} />}
            </DetailRow>
          );
        })}
      </Stack>
    );
  }

  return <ScalarValue value={value as boolean | null | number | string} />;
}

function parseOutput(outputJson: string) {
  try {
    return JSON.parse(outputJson) as unknown;
  } catch {
    return outputJson;
  }
}

function splitOutput(value: unknown) {
  if (!isRecord(value)) return { data: value, technical: undefined };

  const technical: JsonRecord = {};
  if (isRecord(value.meta)) {
    for (const [name, item] of Object.entries(value.meta)) {
      if (!["sourceId", "sourceName"].includes(name)) technical[name] = item;
    }
  }

  if (isRecord(technical.client)) {
    const { ip, ...clientContext } = technical.client;
    delete technical.client;
    if (typeof ip === "string" && ip) technical.clientIp = ip;
    if (Object.keys(clientContext).length > 0) technical.client = clientContext;
  }

  const otherData = Object.fromEntries(
    Object.entries(value).filter(
      ([name]) => !["date", "meta", "payload"].includes(name),
    ),
  );
  const data =
    "payload" in value
      ? isRecord(value.payload)
        ? { ...otherData, ...value.payload }
        : value.payload
      : otherData;

  return {
    data,
    technical: Object.keys(technical).length > 0 ? technical : undefined,
  };
}

export function InboxItemValues({ outputJson }: { outputJson: string }) {
  const { data, technical } = splitOutput(parseOutput(outputJson));
  const [view, setView] = useState<DataView>("fields");
  return (
    <>
      <ResourceSection title="Data" actions={<DataViewControl value={view} onChange={setView} />}>
        {view === "fields" ? <ReadableValue value={data} /> : <SubmissionPayload payload={data} label="Data JSON" />}
      </ResourceSection>
      {technical ? <DetailDisclosure title="Technical details">
        <ReadableValue compact value={technical} />
      </DetailDisclosure> : null}
    </>
  );
}
