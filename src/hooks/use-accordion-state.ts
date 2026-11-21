"use client";

import { useState, type SetStateAction } from "react";

/** Expansion lasts only for this mounted editor and resource. Never persisted. */
export function useAccordionState(scope: string, initialPanels: string[] = []) {
  const [state, setState] = useState<{ scope: string; panels: string[] }>({
    scope,
    panels: initialPanels,
  });
  const panels = state.scope === scope ? state.panels : initialPanels;
  if (state.scope !== scope) setState({ scope, panels: initialPanels });
  const update = (next: SetStateAction<string[]>) =>
    setState((current) => ({
      scope,
      panels:
        typeof next === "function"
          ? next(current.scope === scope ? current.panels : initialPanels)
          : next,
    }));
  return [panels, update] as const;
}
