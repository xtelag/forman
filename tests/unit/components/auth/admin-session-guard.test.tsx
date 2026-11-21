import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, expect, test, vi } from "vitest";
import { AdminSessionGuard } from "@/components/auth/admin-session-guard";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("keeps an edited field mounted across expired and successful login", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  render(
    <MantineProvider>
      <textarea aria-label="Draft" defaultValue="Original" />
      <AdminSessionGuard />
    </MantineProvider>,
  );
  const draft = screen.getByLabelText("Draft");
  fireEvent.change(draft, { target: { value: "Unsaved work" } });
  act(() => window.dispatchEvent(new Event("forman:session-expired")));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText("Draft")).toBe(draft);
  expect(draft).toHaveValue("Unsaved work");
});
test("renews only on activity and throttles consecutive keystrokes", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  render(
    <MantineProvider>
      <AdminSessionGuard />
    </MantineProvider>,
  );
  await act(async () => {
    vi.advanceTimersByTime(120000);
  });
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.keyDown(document, { key: "a" });
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.keyDown(document, { key: "b" });
    vi.advanceTimersByTime(120000);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.keyDown(document, { key: "c" });
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
