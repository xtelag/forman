import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { confirmDiscardChanges, installNavigationGuard, useUnsavedChanges } from "@/client/use-unsaved-changes";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("unsaved sections", () => {
  test("asks once for multiple sections and keeps protection until each is saved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const first = renderHook(({ dirty }) => useUnsavedChanges(dirty), { initialProps: { dirty: true } });
    const second = renderHook(() => useUnsavedChanges(true));
    expect(confirmDiscardChanges()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    first.rerender({ dirty: false });
    expect(confirmDiscardChanges()).toBe(false);
    second.unmount();
    expect(confirmDiscardChanges()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  test("guards programmatic navigation and native unload, then releases a submitted section", () => {
    const stop = installNavigationGuard();
    try {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const section = renderHook(() => useUnsavedChanges(true));
      expect(window.dispatchEvent(new Event("forman:before-navigate", { cancelable: true }))).toBe(false);
      expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
      confirm.mockReturnValue(true);
      expect(window.dispatchEvent(new Event("forman:before-navigate", { cancelable: true }))).toBe(true);
      const restore = section.result.current();
      expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
      act(restore);
      expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
    } finally { stop(); }
  });

  test("restores a cancelled history traversal without delivering it to the router", () => {
    const stop = installNavigationGuard();
    try {
      const initialIndex = history.state.__formanNavigationIndex;
      history.pushState({ router: "preserved" }, "", "/editor");
      expect(history.state.router).toBe("preserved");
      renderHook(() => useUnsavedChanges(true));
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const go = vi.spyOn(history, "go").mockImplementation(() => {});
      const router = vi.fn();
      window.addEventListener("popstate", router);
      window.dispatchEvent(new PopStateEvent("popstate", { state: { __formanNavigationIndex: initialIndex } }));
      expect(go).toHaveBeenCalledWith(1);
      expect(router).not.toHaveBeenCalled();
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      expect(router).not.toHaveBeenCalled();
      window.removeEventListener("popstate", router);
    } finally { stop(); }
  });
});
