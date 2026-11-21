import { act, cleanup, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const stateUpdates = vi.hoisted(() => [] as unknown[]);

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const [state, setState] = actual.useState(initial);
      return [
        state,
        (next: T | ((current: T) => T)) => {
          stateUpdates.push(next);
          setState(next);
        },
      ] as const;
    },
  };
});

import { listSources } from "@/client/admin-api/sources";
import { useAdminResource } from "@/client/use-admin-resource";

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve: resolve! };
}

describe("useAdminResource", () => {
  test("retains rows while changing queries and ignores superseded responses", async () => {
    const slow = deferred<string>();
    const latest = deferred<string>();
    const load = vi.fn().mockResolvedValueOnce("A").mockReturnValueOnce(slow.promise).mockReturnValueOnce(latest.promise);
    let current: ReturnType<typeof useAdminResource<string>>;
    function Probe({ query }: { query: string }) {
      current = useAdminResource(load, query, { keepPreviousData: true });
      return <span>{current.data}</span>;
    }
    const view = render(<Probe query="A" />);
    await screen.findByText("A");
    view.rerender(<Probe query="B" />);
    await act(async () => {});
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(current!.loading).toBe(true);
    view.rerender(<Probe query="C" />);
    await act(async () => {});
    await act(async () => latest.resolve("C"));
    await act(async () => slow.resolve("B"));
    expect(screen.getByText("C")).toBeInTheDocument();
    load.mockRejectedValueOnce(new Error("offline"));
    view.rerender(<Probe query="D" />);
    await act(async () => {});
    expect(current!.error).toBeInstanceOf(Error);
    expect(current!.data).toBeUndefined();
  });

  test("never presents a previous query's data as the new query when loading fails", async () => {
    const next = deferred<string>();
    const load = vi
      .fn()
      .mockResolvedValueOnce("source A")
      .mockReturnValueOnce(next.promise);
    let current: ReturnType<typeof useAdminResource<string>>;
    function Probe({ query }: { query: string }) {
      current = useAdminResource(load, query);
      return (
        <span>
          {current.loading
            ? "loading"
            : current.error
              ? "failed"
              : current.data}
        </span>
      );
    }
    const view = render(<Probe query="A" />);
    await screen.findByText("source A");
    view.rerender(<Probe query="B" />);
    expect(screen.queryByText("source A")).not.toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
    await act(async () => next.resolve("source B"));
    expect(screen.getByText("source B")).toBeInTheDocument();
    load.mockRejectedValueOnce(new Error("offline"));
    view.rerender(<Probe query="C" />);
    await screen.findByText("failed");
    expect(current!.data).toBeUndefined();
    expect(current!.stale).toBe(false);
  });

  test("preserves data and its last success after failure until a retry succeeds", async () => {
    const failure = new Error("offline");
    const recovery = deferred<string>();
    const load = vi
      .fn()
      .mockResolvedValueOnce("saved")
      .mockRejectedValueOnce(failure)
      .mockReturnValueOnce(recovery.promise);
    let current: ReturnType<typeof useAdminResource<string>>;
    function Probe() {
      current = useAdminResource(load);
      return (
        <button onClick={current.refresh}>{current.data ?? "loading"}</button>
      );
    }
    render(<Probe />);
    await screen.findByRole("button", { name: "saved" });
    const lastSuccess = current!.lastUpdatedAt;
    await act(async () => current!.refresh());
    expect(current!.data).toBe("saved");
    expect(current!.error).toBeUndefined();
    expect(current!.refreshError).toBe(failure);
    expect(current!.stale).toBe(true);
    expect(current!.lastUpdatedAt).toBe(lastSuccess);
    await act(async () => current!.refresh());
    expect(current!.stale).toBe(true);
    expect(current!.refreshing).toBe(true);
    await act(async () => recovery.resolve("recovered"));
    expect(current!.data).toBe("recovered");
    expect(current!.stale).toBe(false);
    expect(current!.refreshError).toBeUndefined();
  });

  afterEach(() => {
    cleanup();
    stateUpdates.length = 0;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("loads a resource and refreshes it with same-origin credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ id: "form-1" }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    function Probe() {
      const state = useAdminResource(() => listSources());
      return (
        <button onClick={state.refresh}>
          {state.loading ? "loading" : String(state.data?.length)}
        </button>
      );
    }

    render(<Probe />);
    await screen.findByRole("button", { name: "0" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/v1/sources",
      expect.objectContaining({ credentials: "same-origin" }),
    );

    await act(async () => {
      screen.getByRole("button").click();
    });
    await screen.findByRole("button", { name: "1" });
  });

  test("keeps loaded content visible while refreshing", async () => {
    const next = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      )
      .mockReturnValueOnce(next.promise);
    vi.stubGlobal("fetch", fetchMock);

    function Probe() {
      const state = useAdminResource(() => listSources());
      return (
        <button onClick={state.refresh}>
          {state.loading ? "loading" : String(state.data?.length)}
        </button>
      );
    }

    render(<Probe />);
    await screen.findByRole("button", { name: "0" });

    await act(async () => {
      screen.getByRole("button", { name: "0" }).click();
    });

    expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();

    await act(async () => {
      next.resolve(
        new Response(JSON.stringify({ items: [{ id: "form-1" }] }), {
          status: 200,
        }),
      );
      await next.promise;
    });

    await screen.findByRole("button", { name: "1" });
  });

  test("reports a non-blocking refresh while keeping rendered data", async () => {
    let next = deferred<string>();

    function Probe() {
      const state = useAdminResource(() => next.promise);
      return (
        <>
          {state.loading ? (
            <span>loading</span>
          ) : (
            <button onClick={state.refresh}>
              {state.refreshing ? "refreshing" : state.data}
            </button>
          )}
        </>
      );
    }

    render(<Probe />);
    await act(async () => next.resolve("first"));
    await screen.findByRole("button", { name: "first" });

    next = deferred<string>();
    await act(async () =>
      screen.getByRole("button", { name: "first" }).click(),
    );

    expect(
      screen.getByRole("button", { name: "refreshing" }),
    ).toBeInTheDocument();
  });

  test("refreshes an ambient resource every thirty seconds while visible", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue("first");

    function Probe() {
      const state = useAdminResource(load, "ambient", { policy: "ambient" });
      return <span>{String(state.data ?? "loading")}</span>;
    }

    render(<Probe />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(load).toHaveBeenCalledTimes(2);
  });

  test("refreshes an active operational resource every three seconds", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue({ status: "processing" });

    function Probe() {
      const state = useAdminResource<{ status: string }>(load, "operational", {
        active: (value) => value.status === "processing",
        policy: "operational",
      });
      return <span>{state.data?.status ?? "loading"}</span>;
    }

    render(<Probe />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(load).toHaveBeenCalledTimes(2);
  });

  test("switches between idle and active refresh intervals without hiding loaded data", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce({ status: "completed" })
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValue({ status: "completed" });
    function Probe() {
      const state = useAdminResource<{ status: string }>(load, "idle", {
        policy: "operational",
        active: (value) => value.status === "processing",
        inactiveInterval: 30_000,
      });
      return <span>{state.data?.status ?? "loading"}</span>;
    }
    render(<Probe />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("processing")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(load).toHaveBeenCalledTimes(3);
    expect(screen.getByText("completed")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(load).toHaveBeenCalledTimes(3);
  });

  test("does not call a resource state setter after unmount", async () => {
    const pending = deferred<string>();

    function Probe() {
      const load = useCallback(() => pending.promise, []);
      const state = useAdminResource(load);
      return <span>{state.loading ? "loading" : state.data}</span>;
    }

    const view = render(<Probe />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    view.unmount();
    stateUpdates.length = 0;

    await act(async () => {
      pending.resolve("complete");
      await pending.promise;
    });

    expect(stateUpdates).toHaveLength(0);
  });

  test("uses a newer loader identity on refresh", async () => {
    function Probe() {
      const [value, setValue] = useState("first");
      const load = useCallback(async () => value, [value]);
      const state = useAdminResource(load);
      return (
        <>
          <button onClick={() => setValue("second")}>change</button>
          <button onClick={state.refresh}>
            {state.loading ? "loading" : state.data}
          </button>
        </>
      );
    }

    render(<Probe />);
    await screen.findByRole("button", { name: "first" });

    await act(async () => {
      screen.getByRole("button", { name: "change" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "first" }).click();
    });

    await screen.findByRole("button", { name: "second" });
  });
});

test("reloads after a mutation even while an older refresh is in flight",async()=>{
 const old=deferred<string>();let current:ReturnType<typeof useAdminResource<string>>;
 const load=vi.fn().mockResolvedValueOnce("initial").mockReturnValueOnce(old.promise).mockResolvedValue("updated");
 function Probe(){current=useAdminResource(load);return <span>{current.data}</span>}
 render(<Probe/>);await screen.findByText("initial");
 await act(async()=>current!.refresh());await act(async()=>current!.refresh());
 await act(async()=>old.resolve("before mutation"));
 await screen.findByText("updated");
 expect(load).toHaveBeenCalledTimes(3);
});
