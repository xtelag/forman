"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const navigationStartEvent = "forman:navigation-start";
const navigationCompleteEvent = "forman:navigation-complete";
export const loadingIndicatorDelay = 150;
const NavigationProgressContext = createContext({
  navigating: false,
  visible: false,
});

export function startNavigationProgress() {
  window.dispatchEvent(new Event(navigationStartEvent));
}

export function finishNavigationProgress() {
  window.dispatchEvent(new Event(navigationCompleteEvent));
}

export function useNavigationInProgress() {
  return useContext(NavigationProgressContext).navigating;
}

export function NavigationProgress() {
  const { visible } = useContext(NavigationProgressContext);
  if (!visible) return null;
  return (
    <div
      aria-label="Loading next page"
      className="absolute inset-x-0 top-0 z-50 h-0.5 origin-left animate-pulse bg-[var(--mantine-primary-color-filled)]"
      role="progressbar"
    />
  );
}

export function NavigationProgressProvider({
  children,
}: {
  children?: ReactNode;
}) {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    function start() {
      if (timeout.current) clearTimeout(timeout.current);
      setNavigating(true);
      timeout.current = setTimeout(
        () => setVisible(true),
        loadingIndicatorDelay,
      );
    }

    function finish() {
      if (timeout.current) clearTimeout(timeout.current);
      setVisible(false);
      setNavigating(false);
    }

    window.addEventListener(navigationStartEvent, start);
    window.addEventListener(navigationCompleteEvent, finish);
    return () => {
      window.removeEventListener(navigationStartEvent, start);
      window.removeEventListener(navigationCompleteEvent, finish);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  return (
    <NavigationProgressContext.Provider value={{ navigating, visible }}>
      {children}
    </NavigationProgressContext.Provider>
  );
}
