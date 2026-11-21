"use client";
import {
  Button,
  Modal,
  Popover,
  Grid,
  Group,
  Box,
  type GridColProps,
} from "@mantine/core";
import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { CollectionToolbar } from "./collection-toolbar";
import { AppLink } from "@/components/layout/app-link";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Filters for a collection. On phones the panel starts collapsed behind a
 * "Filters" button so the first records stay above the fold.
 */
export function FilterPanel({
  activeCount = 0,
  children,
  onSubmit,
  label,
  toolbar,
  tags,
  formKey,
}: {
  /** Applied filters, shown on the collapsed mobile toggle. */
  activeCount?: number;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => boolean | void;
  label: string;
  toolbar?: ReactNode;
  tags?: ReactNode;
  formKey?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panel = (
    <Box
      component="form"
      role="search"
      aria-label={label}
      id={panelId}
      onSubmit={(event) => {
        if (onSubmit(event) !== false) setOpen(false);
      }}
    >
      <Grid key={formKey} gap="md" align="end">
        {children}
      </Grid>
    </Box>
  );
  const toggle = (
    <Button
      variant="default"
      type="button"
      leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen((value) => !value)}
    >
      {activeCount ? `Filters (${activeCount})` : "Filters"}
    </Button>
  );
  return (
    <CollectionToolbar
      search={toolbar}
      tags={tags}
      filters={
        isMobile ? (
          <>
            {toggle}
            <Modal
              opened={open}
              onClose={() => setOpen(false)}
              title="Filters"
              keepMounted
            >
              {panel}
            </Modal>
          </>
        ) : (
          <Popover
            opened={open}
            onChange={setOpen}
            trapFocus
            returnFocus
            keepMounted
            position="bottom-end"
            width={560}
            shadow="md"
            withinPortal={false}
          >
            <Popover.Target>{toggle}</Popover.Target>
            <Popover.Dropdown maw="calc(100vw - 32px)">
              {panel}
            </Popover.Dropdown>
          </Popover>
        )
      }
    />
  );
}

export function FilterField({
  children,
  span = { base: 12, sm: 6 },
}: {
  children: ReactNode;
  span?: GridColProps["span"];
}) {
  return <Grid.Col span={span}>{children}</Grid.Col>;
}
/**
 * Reset and Apply for a filter panel. Reset clears every filter in the panel,
 * either by navigating to the unfiltered URL or through a callback.
 */
export function FilterActions({
  hasFilters,
  onReset,
  resetHref,
  span = 12,
}: {
  hasFilters: boolean;
  span?: GridColProps["span"];
} & (
  | { onReset?: never; resetHref: string }
  | { onReset: () => void; resetHref?: never }
)) {
  const resetIcon = <RotateCcw size={16} aria-hidden="true" />;
  return (
    <FilterField span={span}>
      <Group justify="flex-end" gap="sm">
        {hasFilters && resetHref ? (
          <Button
            component={AppLink}
            href={resetHref}
            aria-label="Reset filters"
            variant="default"
            leftSection={resetIcon}
          >
            Reset
          </Button>
        ) : (
          <Button
            aria-label="Reset filters"
            disabled={!hasFilters}
            onClick={onReset}
            type="button"
            variant="default"
            leftSection={resetIcon}
          >
            Reset
          </Button>
        )}
        <Button
          aria-label="Apply filters"
          type="submit"
          leftSection={<Search size={16} aria-hidden="true" />}
        >
          Apply filters
        </Button>
      </Group>
    </FilterField>
  );
}
