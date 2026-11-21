"use client";
import { SegmentedControl } from "@mantine/core";

export type DataView = "fields" | "json";
export function DataViewControl({ value, onChange }: {
  value: DataView;
  onChange: (value: DataView) => void;
}) {
  return <SegmentedControl size="xs" aria-label="Data view" value={value}
    onChange={(next) => onChange(next as DataView)}
    data={[{ label: "Fields", value: "fields" }, { label: "JSON", value: "json" }]} />;
}
