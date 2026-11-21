/* eslint-disable @next/next/no-img-element -- These are local vector logo assets, not content images. */

export function FormanWordmark() {
  return <img alt="" className="block h-7 w-auto dark:brightness-0 dark:invert" data-testid="forman-wordmark" src="/brand/logo-forman-ascii.svg" />;
}

export function FormanMonogram() {
  return <img alt="" className="hidden size-7 dark:brightness-0 dark:invert group-data-[collapsible=icon]:block" data-testid="forman-monogram" src="/brand/logo-f-ascii.svg" />;
}
