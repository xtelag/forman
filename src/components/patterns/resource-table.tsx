"use client";

import {
  Box,
  Divider,
  Loader,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import {
  useId,
  useState,
  useEffect,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { tableColumnWidths } from "./table-column-widths";
import { DataTable } from "mantine-datatable";
import { createPortal } from "react-dom";
import { PAGE_SIZES } from "@/shared/pagination";
import type { TablePaginationProperties } from "./table-pagination";

export type ResourceTableColumn<Item> = {
  className?: string;
  id: string;
  label: ReactNode;
  mobileAction?: boolean;
  mobileLabel?: ReactNode;
  render: (item: Item) => ReactNode;
  sizing?: "action" | "compact";
  width?: number;
  sort?: { direction: "ascending" | "descending" | "none"; onSort: () => void };
};

type ResourceTableProperties<Item> = {
  pagination?: TablePaginationProperties;
  bulkActions?: ReactNode;
  busy?: boolean;
  ariaLabel: string;
  columns: ResourceTableColumn<Item>[];
  desktopBreakpoint?: "md" | "xl" | "2xl" | "container";
  embedded?: boolean;
  getRowKey: (item: Item) => string;
  items: Item[];
  tableClassName?: string;
  onRowClick?: (item: Item) => void;
  rowClassName?: (item: Item) => string | undefined;
  selection?: {
    allSelected: boolean | "indeterminate";
    isSelectable?: (item: Item) => boolean;
    isSelected: (item: Item) => boolean;
    onSelectAll: (selected: boolean) => void;
    onSelectedChange: (item: Item, selected: boolean) => void;
  };
};

export function ResourceTable<Item>({
  ariaLabel,
  pagination,
  bulkActions,
  busy = false,
  columns,
  desktopBreakpoint = "md",
  embedded = false,
  getRowKey,
  items,
  selection,
  tableClassName,
  onRowClick,
  rowClassName,
}: ResourceTableProperties<Item>) {
  const headerId = useId();
  const [topControls, setTopControls] = useState<HTMLDivElement | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setShowLoading(true), 300);
    return () => { clearTimeout(timer); setShowLoading(false); };
  }, [busy]);
  function openRow(event: MouseEvent<Element>, item: Item) {
    if (
      !onRowClick ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (
      (event.target as Element).closest(
        'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [data-row-action]',
      )
    )
      return;
    if (window.getSelection()?.toString()) return;
    onRowClick(item);
  }
  function openRowWithKeyboard(event: KeyboardEvent<HTMLElement>, item: Item) {
    if (
      event.target !== event.currentTarget ||
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    onRowClick?.(item);
  }
  const entityName = ariaLabel.toLowerCase().replace(/s$/, "");
  const breakpoint =
    desktopBreakpoint === "2xl"
      ? "96em"
      : desktopBreakpoint === "container"
        ? "md"
        : desktopBreakpoint;
  const tableWidths = tableColumnWidths(columns, selection ? 44 : 0);
  const displayWidth = tableWidths.displayWidth;
  const stickyAction = (column: ResourceTableColumn<Item>) =>
    column.sizing === "action" && column === columns[columns.length - 1]
      ? true
      : undefined;
  const selectItem = (item: Item) =>
    selection ? (
      <Box
        component="label"
        w={{ base: 44, md: 18 }}
        h={{ base: 44, md: 18 }}
        display="flex"
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <Checkbox
          aria-label={"Select " + entityName + " " + getRowKey(item)}
          disabled={selection.isSelectable?.(item) === false}
          checked={selection.isSelected(item)}
          onChange={(event) =>
            selection.onSelectedChange(item, event.currentTarget.checked)
          }
        />
      </Box>
    ) : null;
  const fields = columns.filter((column) => !column.mobileAction);
  const actions = columns.filter((column) => column.mobileAction);
  if (pagination)
    return (
      <Paper
        withBorder
        radius="md"
        miw={0}
        w="100%"
        maw="100%"
        aria-busy={busy}
        data-slot="resource-table"
        style={{ overflow: "hidden" }}
      >
        <Box ref={setTopControls} mih={44} px="md" py="xs" />
        <Divider />
        <DataTable<Item>
          aria-label={ariaLabel}
          records={items}
          idAccessor={getRowKey}
          horizontalSpacing="md"
          verticalSpacing="xs"
          highlightOnHover
          minHeight={150}
          styles={{
            table: {
              tableLayout: "fixed",
              width: "100%",
              minWidth: tableWidths.totalWidth,
            },
          }}
          pinLastColumn={columns.at(-1)?.sizing === "action"}
          columns={columns.map((column) => ({
            accessor: column.id,
            title: column.label,
            width: displayWidth(column),
            render: column.render,
            cellsClassName: column.className,
          }))}
          onRowClick={
            onRowClick
              ? ({ record, event }) => openRow(event, record)
              : undefined
          }
          rowClassName={(item) =>
            [
              rowClassName?.(item),
              onRowClick ? "mantine-focus-auto" : undefined,
            ]
              .filter(Boolean)
              .join(" ")
          }
          rowStyle={() => ({ cursor: onRowClick ? "pointer" : undefined })}
          customRowAttributes={(item) => ({
            tabIndex: onRowClick ? 0 : undefined,
            onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) =>
              openRowWithKeyboard(event, item),
          })}
          rowBackgroundColor={(item) =>
            selection?.isSelected(item)
              ? "var(--mantine-primary-color-light)"
              : undefined
          }
          {...(selection
            ? {
                selectionColumnStyle: { width: 44, minWidth: 44 },
                selectedRecords: items.filter(selection.isSelected),
                isRecordSelectable: (item: Item) =>
                  !busy && selection.isSelectable?.(item) !== false,
                onSelectedRecordsChange: (records: Item[]) => {
                  if (busy) return;
                  const next = new Set(records.map(getRowKey));
                  for (const item of items) {
                    if (
                      selection.isSelectable?.(item) !== false &&
                      selection.isSelected(item) !== next.has(getRowKey(item))
                    )
                      selection.onSelectedChange(
                        item,
                        next.has(getRowKey(item)),
                      );
                  }
                },
                allRecordsSelectionCheckboxProps: {
                  "aria-label":
                    "Select " + ariaLabel.toLowerCase() + " on this page",
                  checked: selection.allSelected === true,
                  indeterminate: selection.allSelected === "indeterminate",
                  disabled:
                    busy ||
                    !items.some(
                      (item) => selection.isSelectable?.(item) !== false,
                    ),
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                    selection.onSelectAll(event.currentTarget.checked),
                },
                getRecordSelectionCheckboxProps: (item: Item) => ({
                  "aria-label": "Select " + entityName + " " + getRowKey(item),
                }),
              }
            : {})}
          page={pagination.page}
          recordsPerPage={pagination.pageSize}
          totalRecords={pagination.total}
          recordsPerPageOptions={[...PAGE_SIZES]}
          recordsPerPageLabel="Rows per page"
          onPageChange={pagination.onPageChange}
          onRecordsPerPageChange={pagination.onPageSizeChange}
          paginationText={({ from, to, totalRecords }) =>
            from + "–" + to + " of " + totalRecords
          }
          getPaginationControlProps={(control) => ({
            "aria-label": {
              first: "First page",
              last: "Last page",
              previous: "Previous page",
              next: "Next page",
            }[control],
          })}
          renderPagination={({ Controls }) => {
            const controls = (position: string) => (
              <Group
                role="group"
                aria-label={position + " table controls"}
                justify="space-between"
                gap="sm"
                mih={44}
                w="100%"
              >
                <Group gap="xs" wrap="nowrap">
                  <Controls.PageSizeSelector />
                  <Box w={16} h={16}>
                    {position === "Top" && busy && showLoading ? (
                      <Loader size={16} aria-label={"Updating " + ariaLabel} />
                    ) : null}
                  </Box>
                </Group>
                {bulkActions ?? <Controls.Text />}
                <Controls.Pagination boundaries={1} siblings={1} />
              </Group>
            );
            return (
              <>
                {topControls
                  ? createPortal(controls("Top"), topControls)
                  : null}
                {controls("Bottom")}
              </>
            );
          }}
        />
      </Paper>
    );
  return (
    <Box
      data-slot="resource-table"
      miw={0}
      w="100%"
      maw="100%"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <Paper
        withBorder={!embedded}
        visibleFrom={desktopBreakpoint === "2xl" ? undefined : breakpoint}
        display={
          desktopBreakpoint === "2xl"
            ? { base: "none", [breakpoint]: "block" }
            : undefined
        }
        data-slot="resource-table-desktop"
      >
        <Table.ScrollContainer
          pos="relative"
          minWidth={tableWidths.totalWidth}
          type="native"
        >
          <Table
            aria-label={ariaLabel}
            className={tableClassName}
            layout="fixed"
            w="100%"
            horizontalSpacing="md"
            verticalSpacing="xs"
            highlightOnHover
          >
            <Table.Thead>
              <Table.Tr>
                {selection ? (
                  <Table.Th w={44}>
                    <Checkbox
                      aria-label={"Select all " + ariaLabel.toLowerCase()}
                      checked={selection.allSelected === true}
                      indeterminate={selection.allSelected === "indeterminate"}
                      onChange={(event) =>
                        selection.onSelectAll(event.currentTarget.checked)
                      }
                    />
                  </Table.Th>
                ) : null}
                {columns.map((column) => (
                  <Table.Th
                    key={column.id}
                    id={headerId + column.id}
                    scope="col"
                    w={displayWidth(column)}
                    className={column.className}
                    aria-sort={column.sort?.direction}
                    data-sticky-action={stickyAction(column)}
                  >
                    {column.sort ? (
                      <Button
                        variant="subtle"
                        color="gray"
                        size="compact-sm"
                        aria-label={
                          "Sort by " +
                          (typeof column.label === "string"
                            ? column.label
                            : column.id)
                        }
                        onClick={column.sort.onSort}
                        rightSection={
                          <span aria-hidden="true">
                            {column.sort.direction === "ascending"
                              ? "↑"
                              : column.sort.direction === "descending"
                                ? "↓"
                                : "↕"}
                          </span>
                        }
                      >
                        {column.label}
                      </Button>
                    ) : (
                      column.label
                    )}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr
                  key={getRowKey(item)}
                  className={[
                    rowClassName?.(item),
                    onRowClick ? "mantine-focus-auto" : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => openRowWithKeyboard(event, item)
                      : undefined
                  }
                  style={{ cursor: onRowClick ? "pointer" : undefined }}
                  bg={
                    selection?.isSelected(item)
                      ? "var(--mantine-primary-color-light)"
                      : undefined
                  }
                  onClick={
                    onRowClick ? (event) => openRow(event, item) : undefined
                  }
                >
                  {selection ? (
                    <Table.Td data-row-action style={{ cursor: "default" }}>
                      {selectItem(item)}
                    </Table.Td>
                  ) : null}
                  {columns.map((column) => (
                    <Table.Td
                      key={column.id}
                      className={column.className}
                      headers={headerId + column.id}
                      style={{ overflowWrap: "anywhere" }}
                      data-sticky-action={stickyAction(column)}
                    >
                      {column.render(item)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      <Stack
        role="list"
        aria-label={ariaLabel}
        hiddenFrom={desktopBreakpoint === "2xl" ? undefined : breakpoint}
        display={
          desktopBreakpoint === "2xl"
            ? { base: "block", [breakpoint]: "none" }
            : undefined
        }
        gap="sm"
        data-slot="resource-table-mobile-list"
      >
        {items.map((item) => (
          <Paper
            component="div"
            withBorder={!embedded}
            p="md"
            key={getRowKey(item)}
            className={[
              rowClassName?.(item),
              onRowClick ? "mantine-focus-auto" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={
              onRowClick
                ? (event) => openRowWithKeyboard(event, item)
                : undefined
            }
            style={{ cursor: onRowClick ? "pointer" : undefined }}
            bg={
              selection?.isSelected(item)
                ? "var(--mantine-primary-color-light)"
                : undefined
            }
            onClick={onRowClick ? (event) => openRow(event, item) : undefined}
            role="listitem"
            data-slot="resource-table-mobile-row"
          >
            <Group align="flex-start" wrap="nowrap" gap="sm">
              {selection ? (
                <Box data-row-action style={{ cursor: "default" }}>
                  {selectItem(item)}
                </Box>
              ) : null}
              <Stack component="dl" m={0} gap="sm" flex={1} miw={0}>
                {fields.map((column) => (
                  <Box key={column.id} miw={0}>
                    <Text component="dt" size="xs" c="dimmed" mb={4}>
                      {column.mobileLabel ?? column.label}
                    </Text>
                    <Box
                      component="dd"
                      m={0}
                      fz="sm"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {column.render(item)}
                    </Box>
                  </Box>
                ))}
              </Stack>
              {actions.length ? (
                <Group gap={4} data-row-action>
                  {actions.map((column) => (
                    <Box key={column.id}>{column.render(item)}</Box>
                  ))}
                </Group>
              ) : null}
            </Group>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
