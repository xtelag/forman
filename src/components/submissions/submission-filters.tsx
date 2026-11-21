"use client";
import { CollectionToolbar } from "@/components/patterns/collection-toolbar";
import {
  ActionIcon,
  Box,
  Button,
  Grid,
  Popover,
  NativeSelect,
  Stack,
  Modal,
  TextInput,
} from "@mantine/core";
import {
  useId,
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMediaQuery } from "@mantine/hooks";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { AdminSourceSummary } from "@/client/admin-api/sources";
import { FilterActions, FilterField } from "@/components/patterns/filter-panel";
import {
  DateRangeError,
  DateRangeFields,
  useDateRangeError,
} from "@/components/patterns/date-range-filter";
export type SubmissionFiltersValue = {
  type?: string;
  state?: string;
  sourceId?: string;
  from?: string;
  search?: string;
  to?: string;
};

type SubmissionFiltersProperties = {
  sources: AdminSourceSummary[];
  tags?: ReactNode;
  extraActiveCount?: number;
  hasTagFilters?: boolean;
  searchSuspended?: boolean;
  onSearch: (search: string) => void;
  onSearchDraft: (search: string) => void;
  onSubmit: (value: SubmissionFiltersValue) => void;
  value: SubmissionFiltersValue;
};

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

export function SubmissionFilters({
  sources,
  onSubmit,
  onSearch,
  onSearchDraft,
  searchSuspended = false,
  value,
  tags,
  extraActiveCount = 0,
  hasTagFilters = false,
}: SubmissionFiltersProperties) {
  const [search, setSearch] = useState(value.search ?? "");
  const searchCallback = useRef(onSearch);
  useEffect(() => {
    searchCallback.current = onSearch;
  }, [onSearch]);
  const searchInput = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  const pendingSearches = useRef(new Set<string>());
  const mobile = useMediaQuery("(max-width: 47.99em)");
  useEffect(() => {
    const acknowledged = value.search ?? "";
    if (!pendingSearches.current.delete(acknowledged)) {
      setSearch(acknowledged);
      onSearchDraft(acknowledged);
    }
  }, [value.search, onSearchDraft]);
  useEffect(() => {
    if (searchSuspended || search.trim() === (value.search ?? "") || composing)
      return;
    const timer = setTimeout(() => {
      pendingSearches.current.add(search.trim());
      searchCallback.current(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search, value.search, composing, searchSuspended]);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const activeCount =
    [value.sourceId, value.type, value.state, value.from, value.to].filter(
      Boolean,
    ).length + extraActiveCount;
  const hasFilters = Boolean(
    hasTagFilters ||
    extraActiveCount ||
    value.type ||
    value.state ||
    value.sourceId ||
    value.from ||
    value.search ||
    value.to,
  );

  const dateRange = useDateRangeError();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (
      !dateRange.check(
        event.currentTarget,
        stringValue(values.get("from")),
        stringValue(values.get("to")),
      )
    ) {
      setOpen(true);
      const form = event.currentTarget;
      requestAnimationFrame(() =>
        form.querySelector<HTMLInputElement>('[data-date-range="to"]')?.focus(),
      );
      return;
    }
    const sourceId = stringValue(values.get("sourceId"));
    setOpen(false);
    onSubmit({
      type: stringValue(values.get("type")),
      state: stringValue(values.get("state")),
      sourceId: sourceId === "all" ? undefined : sourceId,
      from: stringValue(values.get("from")),
      search: search.trim() || undefined,
      to: stringValue(values.get("to")),
    });
  }

  const fields = (
    <form onSubmit={submit} aria-label="Advanced Submission filters">
      <Grid align="end" gap="md">
        <FilterField span={12}>
          <NativeSelect
            label="Source"
            defaultValue={value.sourceId ?? "all"}
            id="submission-form"
            name="sourceId"
          >
            <option value="all">All Sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </NativeSelect>
        </FilterField>

        <FilterField span={6}>
          <NativeSelect
            label="Type"
            defaultValue={value.type ?? ""}
            id="submission-type"
            name="type"
          >
            <option value="">All types</option>
            <option value="one-shot">One-shot</option>
            <option value="session">Session</option>
          </NativeSelect>
        </FilterField>
        <FilterField span={6}>
          <NativeSelect
            label="State"
            defaultValue={value.state ?? ""}
            id="submission-state"
            name="state"
          >
            <option value="">All states</option>
            <option value="draft">Draft</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
          </NativeSelect>
        </FilterField>
        <DateRangeFields
          idPrefix="submission"
          defaultFrom={value.from}
          defaultTo={value.to}
          error={dateRange.error}
          onEdit={dateRange.clear}
          span={6}
        />
        <FilterActions
          hasFilters={hasFilters}
          resetHref="/app/submissions"
          span={12}
        />
        <DateRangeError idPrefix="submission" error={dateRange.error} />
      </Grid>
    </form>
  );

  return (
    <Box role="search" aria-label="Submission filters">
      <Stack gap="md">
        <CollectionToolbar
          search={
            <Box>
              <TextInput
                aria-label="Search"
                ref={searchInput}
                leftSection={<Search size={16} />}
                rightSection={
                  search ? (
                    <ActionIcon
                      type="button"
                      variant="subtle"
                      color="gray"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearch("");
                        onSearchDraft("");
                        pendingSearches.current.add("");
                        onSearch("");
                        searchInput.current?.focus();
                      }}
                    >
                      <X size={16} />
                    </ActionIcon>
                  ) : null
                }
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  onSearchDraft(event.currentTarget.value);
                }}
                onCompositionStart={() => {
                  setComposing(true);
                }}
                onCompositionEnd={(event) => {
                  setComposing(false);
                  setSearch(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!composing) {
                      pendingSearches.current.add(search.trim());
                      onSearch(search.trim());
                    }
                  }
                }}
                id="submission-search"
                name="search"
                placeholder="Search Sources and responses"
              />
            </Box>
          }
          tags={tags}
          filters={
            mobile ? (
              <>
                <Button
                  variant="default"
                  type="button"
                  leftSection={<SlidersHorizontal size={16} />}
                  aria-expanded={open}
                  onClick={() => setOpen(true)}
                >
                  {activeCount ? "Filters (" + activeCount + ")" : "Filters"}
                </Button>
                <Modal
                  opened={open}
                  onClose={() => setOpen(false)}
                  title="Filters"
                  keepMounted
                >
                  {fields}
                </Modal>
              </>
            ) : (
              <Popover
                trapFocus
                returnFocus
                keepMounted
                opened={open}
                onChange={setOpen}
                position="bottom-end"
                width={560}
                withinPortal={false}
                shadow="md"
              >
                <Popover.Target>
                  <Button
                    variant="default"
                    type="button"
                    leftSection={<SlidersHorizontal size={16} />}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen((current) => !current)}
                  >
                    {activeCount ? "Filters (" + activeCount + ")" : "Filters"}
                  </Button>
                </Popover.Target>
                <Popover.Dropdown id={panelId} maw="calc(100vw - 32px)">
                  {fields}
                </Popover.Dropdown>
              </Popover>
            )
          }
        />
      </Stack>
    </Box>
  );
}
