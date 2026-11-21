import { safeCsvCell } from "@/shared/format/csv";

type InboxCsvItem = {
  createdAt: Date;
  actionName: string;
  id: string;
  payloadJson: string;
  sourceId: string | null;
  sourceName: string;
  sourcePublicId: string | null;
  state: string;
  submissionId: string | null;
  tags: { color: string; id: string; name: string }[];
};

function csvCell(value: string) {
  const safe = safeCsvCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function serializeInboxCsv(items: InboxCsvItem[]) {
  const rows = items.map((item) => {
    const metadata = {
      submissionId: item.submissionId,
      receivedAt: item.createdAt.toISOString(),
      state: item.state,
      source:
        item.sourceId && item.sourcePublicId
          ? { id: item.sourcePublicId, name: item.sourceName }
          : null,
      action: { name: item.actionName },
      tags: item.tags.map(({ id, name, color }) => ({ id, name, color })),
    };
    return [item.id, JSON.stringify(metadata), item.payloadJson];
  });

  return [["id", "metadata", "payload"], ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
