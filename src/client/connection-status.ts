"use client";

import { useSyncExternalStore } from "react";

export type ConnectionSnapshot = {
  /** Time of the last response from the server while it was reachable. */
  lastReachableAt: number | undefined;
  reachable: boolean;
  retrying: boolean;
};

export const connectionRestoredEvent = "forman:connection-restored";
const healthPath = "/api/admin/v1/health";
const retryDelays = [5_000, 10_000, 30_000];
const reachableSnapshot: ConnectionSnapshot = {
  lastReachableAt: undefined,
  reachable: true,
  retrying: false,
};

let snapshot = reachableSnapshot;
// Loading the application proves the server answered a moment ago.
let lastReachableAt: number | undefined =
  typeof window === "undefined" ? undefined : Date.now();
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let probe: Promise<boolean> | undefined;
const listeners = new Set<() => void>();

function publish(next: Partial<ConnectionSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

export function isServerReachable() {
  return snapshot.reachable;
}

/** Gateway responses mean the proxy could not reach the application. */
export function isUnavailableStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

function scheduleRetry() {
  if (timer) clearTimeout(timer);
  const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
  attempt += 1;
  timer = setTimeout(() => void probeServer(), delay);
}

/** Any successful response proves the server is back. */
export function reportServerReachable() {
  lastReachableAt = Date.now();
  if (snapshot.reachable) return;
  if (timer) clearTimeout(timer);
  timer = undefined;
  attempt = 0;
  publish({ lastReachableAt, reachable: true, retrying: false });
  window.dispatchEvent(new Event(connectionRestoredEvent));
}

function reportServerUnreachable() {
  if (snapshot.reachable)
    publish({ lastReachableAt, reachable: false, retrying: false });
  scheduleRetry();
}

/**
 * Checks liveness once; concurrent callers share the request. A failed data
 * request calls this so that an error of one endpoint is not mistaken for an
 * outage of the whole server.
 */
export function probeServer(timeoutMs = 4_000): Promise<boolean> {
  if (probe) return probe;
  if (!snapshot.reachable) publish({ retrying: true });
  probe = fetch(healthPath, {
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(timeoutMs),
  })
    .then((response) => !isUnavailableStatus(response.status))
    .catch(() => false)
    .then((reachable) => {
      probe = undefined;
      if (reachable) reportServerReachable();
      else reportServerUnreachable();
      if (snapshot.retrying) publish({ retrying: false });
      return reachable;
    });
  return probe;
}

const recentContactMs = 15_000;

/** True when the server answered recently enough to navigate without a probe. */
export function serverRecentlyReachable() {
  return (
    snapshot.reachable &&
    lastReachableAt !== undefined &&
    Date.now() - lastReachableAt < recentContactMs
  );
}

/** Probes only when the last confirmed contact is not recent. */
export function confirmServerReachable() {
  return serverRecentlyReachable() ? Promise.resolve(true) : probeServer();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConnectionStatus() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => reachableSnapshot,
  );
}

/** Test support: return to the initial reachable state. */
export function resetConnectionStatus() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  probe = undefined;
  attempt = 0;
  lastReachableAt = Date.now();
  snapshot = reachableSnapshot;
  listeners.forEach((listener) => listener());
}
