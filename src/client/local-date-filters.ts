/** Convert browser calendar dates only at the API boundary; URL filters remain dates. */
export function localDateBoundary(value: string, endExclusive = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setFullYear(year);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return value;
  if (endExclusive) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function localDateParameters(parameters: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams(parameters);
  for (const key of ["from", "to"]) {
    const value = result.get(key);
    if (value) result.set(key, localDateBoundary(value, key === "to"));
  }
  return result;
}
