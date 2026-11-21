import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { adminRequest } from "@/client/admin-api/client";
import {
  confirmServerReachable,
  connectionRestoredEvent,
  isUnavailableStatus,
  probeServer,
  resetConnectionStatus,
  serverRecentlyReachable,
} from "@/client/connection-status";
import { ConnectionBanner } from "@/components/layout/connection-banner";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";

afterEach(() => {
  cleanup();
  resetConnectionStatus();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("connection status", () => {
  test("treats only gateway responses as an unreachable server", () => {
    expect([502, 503, 504].map(isUnavailableStatus)).toEqual([true, true, true]);
    expect([200, 401, 404, 500].map(isUnavailableStatus)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test("keeps an endpoint error local when the liveness probe succeeds", async () => {
    const fetchMock = vi.fn(async (path: string) =>
      path === "/api/admin/v1/health"
        ? new Response(null, { status: 204 })
        : new Response('{"error":"Maintenance"}', { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionBanner />);

    await expect(adminRequest("/api/admin/v1/dashboard")).rejects.toMatchObject({
      status: 503,
    });
    await act(() => probeServer());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/v1/health",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("shows one banner while the server is unreachable and announces recovery", async () => {
    const user = userEvent.setup();
    let online = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!online) throw new TypeError("Failed to fetch");
        return new Response(null, { status: 204 });
      }),
    );
    const restored = vi.fn();
    window.addEventListener(connectionRestoredEvent, restored);
    render(
      <>
        <ConnectionBanner />
        <AdminResourceNotice
          resource={{
            lastUpdatedAt: Date.now(),
            refresh: vi.fn(),
            refreshing: false,
            stale: true,
          }}
        />
      </>,
    );

    await act(async () => {
      await expect(confirmServerReachable()).resolves.toBe(true);
      await probeServer();
    });
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Server is unavailable.");
    expect(banner).toHaveTextContent("Showing data from");
    // The page notice stays quiet; the banner already explains the outage.
    expect(screen.queryByText(/Couldn.t refresh this page/)).not.toBeInTheDocument();
    expect(serverRecentlyReachable()).toBe(false);

    online = true;
    await user.click(screen.getByRole("button", { name: "Retry now" }));
    await vi.waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Server is unavailable.", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn.t refresh this page/)).toBeInTheDocument();
    window.removeEventListener(connectionRestoredEvent, restored);
  });
});
