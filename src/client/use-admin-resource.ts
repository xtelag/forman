import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectionRestoredEvent,
  isServerReachable,
} from "@/client/connection-status";

export type AdminResource<T> = {
  data: T | undefined;
  error: unknown;
  refreshError: unknown;
  stale: boolean;
  lastUpdatedAt: number | undefined;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
};

type ResourceState<T> = Omit<AdminResource<T>, "refresh"> & { key?: string };

function initialResource<T>(key?: string): ResourceState<T> {
  return {
    key,
    data: undefined,
    error: undefined,
    refreshError: undefined,
    stale: false,
    lastUpdatedAt: undefined,
    loading: true,
    refreshing: false,
  };
}

export type RefreshPolicy = "ambient" | "manual" | "operational";

type AdminResourceOptions<T> = {
  active?: (data: T) => boolean;
  policy?: RefreshPolicy;
  inactiveInterval?: number;
  keepPreviousData?: boolean;
};

const refreshInterval: Record<RefreshPolicy, number | undefined> = {
  ambient: 30_000,
  manual: undefined,
  operational: 3_000,
};

export function useAdminResource<T>(
  load: () => Promise<T>,
  reloadKey?: string,
  { active, policy = "manual", inactiveInterval, keepPreviousData = false }: AdminResourceOptions<T> = {},
): AdminResource<T> {
  const loader = useRef(load);
  const refreshing = useRef(false);
  const queuedRefresh = useRef(false);
  const requestSequence = useRef(0);
  const [resource, setResource] = useState<ResourceState<T>>(() =>
    initialResource<T>(reloadKey),
  );
  const [refreshCount, setRefreshCount] = useState(0);

  // Retaining previous results is opt-in for collections, never resource details.
  // React rerenders this component before committing its children.
  if (resource.key !== reloadKey) {
    setResource({
      ...initialResource<T>(reloadKey),
      data: keepPreviousData ? resource.data : undefined,
    });
  }

  useEffect(() => {
    loader.current = load;
  }, [load]);

  const refresh = useCallback(() => {
    if (refreshing.current) {
      queuedRefresh.current = true;
      return;
    }
    refreshing.current = true;
    setResource((current) => ({
      ...current,
      error: undefined,
      loading: current.data === undefined,
      refreshing: current.data !== undefined,
    }));
    setRefreshCount((count) => count + 1);
  }, []);

  useEffect(() => {
    let active = true;
    queuedRefresh.current = false;
    const loadQueuedRefresh = () => {
      if (!queuedRefresh.current) return false;
      queuedRefresh.current = false;
      refreshing.current = false;
      refresh();
      return true;
    };
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    refreshing.current = true;

    void Promise.resolve()
      .then(() => loader.current())
      .then(
        (data) => {
          if (active && sequence === requestSequence.current) {
            if (loadQueuedRefresh()) return;
            refreshing.current = false;
            setResource({
              key: reloadKey,
              data,
              error: undefined,
              refreshError: undefined,
              stale: false,
              lastUpdatedAt: Date.now(),
              loading: false,
              refreshing: false,
            });
          }
        },
        (error: unknown) => {
          if (active && sequence === requestSequence.current) {
            if (loadQueuedRefresh()) return;
            refreshing.current = false;
            setResource((current) =>
              current.data === undefined || current.loading
                ? { ...current, data: undefined, error, loading: false, refreshing: false }
                : {
                    ...current,
                    refreshError: error,
                    stale: true,
                    loading: false,
                    refreshing: false,
                  },
            );
          }
        },
      );

    return () => {
      active = false;
    };
  }, [refresh, refreshCount, reloadKey]);

  // Reload after an outage so pages do not keep showing old data.
  useEffect(() => {
    window.addEventListener(connectionRestoredEvent, refresh);
    return () => window.removeEventListener(connectionRestoredEvent, refresh);
  }, [refresh]);

  useEffect(() => {
    if (policy === "manual") return;
    const isActive =
      resource.data !== undefined &&
      (policy !== "operational" || active?.(resource.data) === true);
    const interval = isActive
      ? refreshInterval[policy]
      : resource.data !== undefined
        ? inactiveInterval
        : undefined;
    // During an outage the connection probe retries; polling would only add load.
    const refreshWhenVisible = () => {
      if (!refreshing.current && document.visibilityState === "visible" && isServerReachable())
        refresh();
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer =
      interval && document.visibilityState === "visible"
        ? window.setInterval(refreshWhenVisible, interval)
        : undefined;
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [active, inactiveInterval, policy, refresh, resource.data]);

  return { ...resource, refresh };
}
