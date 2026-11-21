"use client";

import { useEffect, useRef } from "react";

const dirtySections = new Set<symbol>();
const historyIndexKey = "__formanNavigationIndex";

export function confirmDiscardChanges(discard = false) {
  if (dirtySections.size && !window.confirm("Discard unsaved changes?")) return false;
  if (discard) dirtySections.clear();
  return true;
}

/** Forget every unsaved draft, for example after its resource was deleted. */
export function discardUnsavedChanges() {
  dirtySections.clear();
}

/** Release only this section after an intentional native form submission/save. */
export function useUnsavedChanges(dirty: boolean) {
  const section = useRef(Symbol("editor section"));
  useEffect(() => {
    const id = section.current;
    if (dirty) dirtySections.add(id);
    else dirtySections.delete(id);
    return () => { dirtySections.delete(id); };
  }, [dirty]);
  return () => {
    const registered = dirtySections.delete(section.current);
    return () => { if (registered) dirtySections.add(section.current); };
  };
}

/** Mounted once in the app shell, including while no editor is dirty. */
export function installNavigationGuard() {
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  let index = Number(history.state?.[historyIndexKey] ?? 0);
  let restoring = false;
  originalReplace.call(history, { ...history.state, [historyIndexKey]: index }, "");
  const push: History["pushState"] = function (state, unused, url) {
    originalPush.call(history, { ...state, [historyIndexKey]: index + 1 }, unused, url);
    index += 1;
  };
  const replace: History["replaceState"] = function (state, unused, url) {
    originalReplace.call(history, { ...state, [historyIndexKey]: index }, unused, url);
  };
  history.pushState = push;
  history.replaceState = replace;

  function traverse(event: PopStateEvent) {
    if (restoring) {
      restoring = false;
      event.stopImmediatePropagation();
      return;
    }
    const next = event.state?.[historyIndexKey];
    if (typeof next !== "number" || next === index) return;
    if (!confirmDiscardChanges()) {
      event.stopImmediatePropagation();
      restoring = true;
      history.go(index - next);
    } else index = next;
  }
  function unload(event: BeforeUnloadEvent) {
    if (!dirtySections.size) return;
    event.preventDefault();
    event.returnValue = "";
  }
  function navigate(event: Event) {
    if (!confirmDiscardChanges()) event.preventDefault();
  }
  window.addEventListener("popstate", traverse, true);
  window.addEventListener("beforeunload", unload);
  window.addEventListener("forman:before-navigate", navigate);
  return () => {
    window.removeEventListener("popstate", traverse, true);
    window.removeEventListener("beforeunload", unload);
    window.removeEventListener("forman:before-navigate", navigate);
    if (history.pushState === push) history.pushState = originalPush;
    if (history.replaceState === replace) history.replaceState = originalReplace;
  };
}
