import { Text } from "@mantine/core";
import { LocalDateTime } from "@/components/patterns/local-date-time";
import type { ResourceTableColumn } from "@/components/patterns/resource-table";
import { TagList } from "@/components/tags/tag-list";
import type { AdminSubmission } from "@/shared/contracts/admin";

export function submissionDetailPath(submissionId: string, returnTo: string) {
  return `/app/submissions/${submissionId}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function submissionTableColumns(): ResourceTableColumn<AdminSubmission>[] {
  return [
    {
      id: "received",
      label: "Received",
      width: 176,
      render: (submission: AdminSubmission) => (
        <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
          <LocalDateTime value={submission.createdAt} />
        </Text>
      ),
      sizing: "compact",
    },
    {
      id: "source",
      label: "Source",
      render: (submission: AdminSubmission) => (
        <span title={submission.sourceName}>{submission.sourceName}</span>
      ),
    },
    {
      id: "type",
      label: "Type",
      width: 112,
      render: (submission) =>
        submission.type === "session" ? "Session" : "One-shot",
    },
    {
      id: "state",
      label: "State",
      width: 128,
      render: (submission) =>
        submission.state === "draft"
          ? "Draft"
          : submission.state === "expired"
            ? "Expired"
            : "Completed",
    },
    {
      id: "tags",
      label: "Tags",
      width: 160,
      render: (submission) => <TagList tags={submission.tags} />,
    },
  ];
}
