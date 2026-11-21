"use client";

import { NativeSelect } from "@mantine/core";
import { CollectionSearch } from "@/components/patterns/collection-search";
import type { FormEvent, ReactNode } from "react";
import {
  DateRangeError,
  DateRangeFields,
} from "@/components/patterns/date-range-filter";
import {
  FilterActions,
  FilterField,
  FilterPanel,
} from "@/components/patterns/filter-panel";

export type InboxFilterDraft = {
  from: string;
  search: string;
  sourceId: string;
  state: string;
  to: string;
};

type InboxFiltersProps = {
  /** Applied filters, shown on the collapsed mobile toggle. */
  tags?: ReactNode;
  search: string;
  onSearch: (value: string) => void;
  activeCount: number;
  dateError: string | null;
  draft: InboxFilterDraft;
  hasFilters: boolean;
  sources: { id: string; name: string }[];
  trash: boolean;
  onChange: (draft: InboxFilterDraft) => void;
  onDateEdit: () => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Inbox filters apply together, like every other filter panel. */
export function InboxFilters({
  activeCount,
  tags,
  search,
  onSearch,
  dateError,
  draft,
  hasFilters,
  sources,
  trash,
  onChange,
  onDateEdit,
  onReset,
  onSubmit,
}: InboxFiltersProps) {
  const change = (next: Partial<InboxFilterDraft>) =>
    onChange({ ...draft, ...next });
  const knownSource =
    draft.sourceId === "all" ||
    sources.some((source) => source.id === draft.sourceId);
  return (
    <FilterPanel
      toolbar={
        <CollectionSearch
          value={search}
          onChange={onSearch}
          placeholder="Search outputs"
        />
      }
      tags={tags}
      label="Inbox filters"
      onSubmit={onSubmit}
      activeCount={activeCount}
    >
      <FilterField span={6}>
        <NativeSelect
          id="inbox-source"
          label="Source"
          aria-label="Filter by Source"
          value={draft.sourceId}
          onChange={(event) => change({ sourceId: event.currentTarget.value })}
        >
          <option value="all">All Sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
          {/* Keep a selected URL filter visible while Sources are loading. */}
          {knownSource ? null : (
            <option value={draft.sourceId}>Selected Source</option>
          )}
        </NativeSelect>
      </FilterField>
      {!trash ? (
        <FilterField span={6}>
          <NativeSelect
            id="inbox-state"
            label="State"
            aria-label="Filter by state"
            value={draft.state}
            onChange={(event) => change({ state: event.currentTarget.value })}
          >
            <option value="all">All states</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </NativeSelect>
        </FilterField>
      ) : null}
      <DateRangeFields
        idPrefix="inbox"
        from={draft.from}
        to={draft.to}
        onFromChange={(from) => change({ from })}
        onToChange={(to) => change({ to })}
        error={dateError}
        onEdit={onDateEdit}
        span={6}
      />
      <FilterActions hasFilters={hasFilters} onReset={onReset} span={12} />
      <DateRangeError idPrefix="inbox" error={dateError} />
    </FilterPanel>
  );
}
