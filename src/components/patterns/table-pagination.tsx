"use client";
import { PAGE_SIZES } from "@/shared/pagination";

import { ActionIcon, Group, Select, Text } from "@mantine/core";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export type TablePaginationProperties = {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: 10 | 50 | 100;
  total: number;
  status?: string;
};
export function TablePagination({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  total,
  status,
}: TablePaginationProperties) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <Group
      component="nav"
      aria-label="Table pagination"
      justify="space-between"
      gap="md"
    >
      <Group gap="sm">
        <Text size="sm" c="dimmed">
          Rows per page
        </Text>
        <Select
          aria-label="Rows per page"
          w={80}
          allowDeselect={false}
          data={PAGE_SIZES.map(String)}
          value={String(pageSize)}
          onChange={(value) => {
            if (value) onPageSizeChange(Number(value));
          }}
        />
        {status ? (
          <Text size="xs" c="dimmed">
            {status}
          </Text>
        ) : null}
      </Group>
      <Group gap="sm">
        <Text size="sm" c="dimmed">
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
          {total}
        </Text>
        <Text size="sm" c="dimmed">
          Page {page} of {pageCount}
        </Text>
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            aria-label="First page"
            variant="subtle"
            color="gray"
            size="lg"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeft size={16} />
          </ActionIcon>
          <ActionIcon
            aria-label="Previous page"
            variant="subtle"
            color="gray"
            size="lg"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon
            aria-label="Next page"
            variant="subtle"
            color="gray"
            size="lg"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} />
          </ActionIcon>
          <ActionIcon
            aria-label="Last page"
            variant="subtle"
            color="gray"
            size="lg"
            disabled={page >= pageCount}
            onClick={() => onPageChange(pageCount)}
          >
            <ChevronsRight size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Group>
  );
}
