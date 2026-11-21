"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime } from "@/shared/format/date";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function LocalDateTime({ value }: { value: string }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const utc = new Date(value).toISOString();
  return <time dateTime={utc} title={`${utc.replace("T", " ").replace("Z", "")} UTC`}>{mounted ? formatDateTime(value) : "—"}</time>;
}
