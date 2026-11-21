export const PAGE_SIZES = [10, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export function parsePageSize(value: string | number | undefined): PageSize {
  const size = Number(value);
  return size === 50 || size === 100 ? size : 10;
}
