import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { resetConnectionStatus } from "@/client/connection-status";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverMock });
if (typeof HTMLElement !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
}

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({
    matches: query.trim() === "", media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  }) });
}

// Editor tabs keep their section in the URL hash; each test starts on a clean URL.
beforeEach(() => {
  if (typeof window !== "undefined" && window.location.hash)
    window.history.replaceState(null, "", window.location.pathname);
});

// The connection state is module-wide; each test starts with a reachable server.
beforeEach(() => resetConnectionStatus());
