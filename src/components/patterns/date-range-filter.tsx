"use client";

import { Text, TextInput, type GridColProps } from "@mantine/core";
import { useState } from "react";
import { FilterField } from "@/components/patterns/filter-panel";

export const reversedDateRangeMessage = "To must be on or after From.";

/**
 * Validates a From–To filter before it is applied. A reversed range would
 * otherwise look like a legitimate empty result.
 */
export function useDateRangeError() {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    clear: () => setError(null),
    /** Returns false and focuses To when From is later than To. */
    check(form: HTMLFormElement, from?: string, to?: string) {
      if (from && to && from > to) {
        setError(reversedDateRangeMessage);
        form
          .querySelector<HTMLInputElement>('[data-date-range="to"]')
          ?.focus();
        return false;
      }
      setError(null);
      return true;
    },
  };
}

type DateRangeFieldsProperties = {
  error: string | null;
  idPrefix: string;
  onEdit: () => void;
  span?: GridColProps["span"];
} & (
  | { defaultFrom?: string; defaultTo?: string; from?: never; to?: never; onFromChange?: never; onToChange?: never }
  | {
      defaultFrom?: never;
      defaultTo?: never;
      from: string;
      to: string;
      onFromChange: (value: string) => void;
      onToChange: (value: string) => void;
    }
);

/** From and To inputs for a filter grid; pair with DateRangeError after the actions. */
export function DateRangeFields({
  defaultFrom,
  defaultTo,
  error,
  from,
  idPrefix,
  onEdit,
  onFromChange,
  onToChange,
  span = 6,
  to,
}: DateRangeFieldsProperties) {
  const controlled = from !== undefined;
  return (
    <>
      <FilterField span={span}>
        <TextInput
          label="From"
          id={`${idPrefix}-from`}
          name="from"
          type="date"
          {...(controlled ? { value: from } : { defaultValue: defaultFrom })}
          onChange={(event) => {
            onFromChange?.(event.currentTarget.value);
            onEdit();
          }}
        />
      </FilterField>
      <FilterField span={span}>
        <TextInput
          label="To"
          id={`${idPrefix}-to`}
          name="to"
          type="date"
          data-date-range="to"
          error={Boolean(error)}
          aria-describedby={error ? `${idPrefix}-date-error` : undefined}
          {...(controlled ? { value: to } : { defaultValue: defaultTo })}
          onChange={(event) => {
            onToChange?.(event.currentTarget.value);
            onEdit();
          }}
        />
      </FilterField>
    </>
  );
}

/** Full-width error row, kept below the filter actions so inputs stay aligned. */
export function DateRangeError({
  error,
  idPrefix,
}: {
  error: string | null;
  idPrefix: string;
}) {
  if (!error) return null;
  return (
    <FilterField span={12}>
      <Text id={`${idPrefix}-date-error`} role="alert" c="red" size="sm">
        {error}
      </Text>
    </FilterField>
  );
}
