const pad = (value: number) => String(value).padStart(2, "0");

/**
 * ISO 8601 date and time in the browser's time zone, for example
 * "2026-09-28 16:07:39". The format is fixed so the English interface never
 * mixes in locale-specific date styles.
 */
export function formatDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function parseDateInput(value: string | null | undefined, endExclusive = false) {
  if (value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    const instant = new Date(value);
    return Number.isFinite(instant.getTime()) && instant.toISOString() === value ? instant : undefined;
  }
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
