"use client";

import { Box, NavLink, ScrollArea, Stack, Text } from "@mantine/core";
import { Blocks, TextSearch } from "lucide-react";
import { useSyncExternalStore } from "react";
import { AppLink } from "@/components/layout/app-link";
import {
  configurationNavigation,
  dataProcessingNavigation,
  workspaceNavigation,
} from "@/components/layout/navigation";

function isActive(href: string, pathname: string) {
  return href === "/app"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

const groupListeners = new Set<() => void>();
// Fallback when browser storage is unavailable, e.g. in a private window.
const groupMemory = new Map<string, boolean>();

function subscribeToGroups(listener: () => void) {
  groupListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    groupListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readGroupOpen(key: string) {
  try {
    return window.localStorage.getItem(key) !== "collapsed";
  } catch {
    return groupMemory.get(key) ?? true;
  }
}

function useStoredGroupState(key: string) {
  const open = useSyncExternalStore(
    subscribeToGroups,
    () => readGroupOpen(key),
    () => true,
  );
  const change = (next: boolean) => {
    groupMemory.set(key, next);
    try {
      if (next) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, "collapsed");
    } catch {
      // Ignore unavailable storage.
    }
    groupListeners.forEach((listener) => listener());
  };
  return [open, change] as const;
}

export function AppSidebar({
  pathname,
  runtimeMode,
  version,
}: {
  pathname: string;
  runtimeMode: "development" | "production" | "test";
  version: string;
}) {
  // Groups start open so every destination is one click away; a group the
  // administrator collapses stays collapsed in this browser.
  const [processingOpen, setProcessingOpen] = useStoredGroupState(
    "forman:navigation:data-review",
  );
  const [configurationOpen, setConfigurationOpen] = useStoredGroupState(
    "forman:navigation:configuration",
  );

  function links(items: typeof workspaceNavigation) {
    return items.map(({ href, label, icon: Icon }) => (
      <NavLink
        key={href}
        component={AppLink}
        href={href}
        label={label}
        leftSection={<Icon size={17} aria-hidden="true" />}
        active={isActive(href, pathname)}
        color="gray"
        c="var(--mantine-color-text)"
        bg={
          isActive(href, pathname)
            ? "var(--mantine-color-default-hover)"
            : undefined
        }
        fw={isActive(href, pathname) ? 600 : 400}
        styles={{ root: { borderRadius: "var(--mantine-radius-sm)" } }}
        aria-current={isActive(href, pathname) ? "page" : undefined}
      />
    ));
  }

  return (
    <Stack h="100%" gap="lg">
      <ScrollArea flex={1} type="auto" offsetScrollbars>
        <Box
          component="nav"
          aria-label="Main navigation"
          data-sidebar="content"
        >
          {links(workspaceNavigation.slice(0, 2))}
          <NavLink
            component="button"
            type="button"
            label="Data Review"
            leftSection={<TextSearch size={17} aria-hidden="true" />}
            opened={processingOpen}
            onChange={setProcessingOpen}
            aria-expanded={processingOpen}
            childrenOffset={12}
          >
            {links(dataProcessingNavigation)}
          </NavLink>
          <NavLink
            component="button"
            type="button"
            label="Configuration"
            leftSection={<Blocks size={17} aria-hidden="true" />}
            opened={configurationOpen}
            onChange={setConfigurationOpen}
            aria-expanded={configurationOpen}
            childrenOffset={12}
          >
            {links(configurationNavigation)}
          </NavLink>
        </Box>
      </ScrollArea>
      <Text size="xs" c="dimmed" px="sm">
        v{version}
        {runtimeMode === "production" ? "" : ` (${runtimeMode})`}
      </Text>
    </Stack>
  );
}
