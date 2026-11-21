"use client";

import type { ComponentProps } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  confirmServerReachable,
  serverRecentlyReachable,
} from "@/client/connection-status";
import { startNavigationProgress } from "@/components/layout/navigation-progress";

const unreachableMessage = "Server is unavailable. Try again when it is back.";

/**
 * Navigates only to a reachable server. Without this check a failed page
 * request makes the browser leave the application for the proxy's error page.
 */
function navigateWhenReachable(navigate: () => void) {
  if (serverRecentlyReachable()) {
    startNavigationProgress();
    navigate();
    return;
  }
  void confirmServerReachable().then((reachable) => {
    if (!reachable) {
      toast.error(unreachableMessage);
      return;
    }
    startNavigationProgress();
    navigate();
  });
}

// Set while a link is clicked again after its server check succeeded.
let confirmedClick = false;

export function AppLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof NextLink>) {
  return (
    <NextLink
      href={href}
      onClick={(event) => {
        if (confirmedClick) {
          confirmedClick = false;
          startNavigationProgress();
          return;
        }
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        )
          return;
        if (
          !window.dispatchEvent(
            new Event("forman:before-navigate", { cancelable: true }),
          )
        ) {
          event.preventDefault();
          return;
        }
        if (serverRecentlyReachable()) {
          startNavigationProgress();
          return;
        }
        // Check the server first, then let Next.js handle the same click.
        event.preventDefault();
        const anchor = event.currentTarget;
        void confirmServerReachable().then((reachable) => {
          if (!reachable) {
            toast.error(unreachableMessage);
            return;
          }
          confirmedClick = true;
          anchor.click();
        });
      }}
      {...props}
    />
  );
}

export function useAppNavigation() {
  const router = useRouter();

  return {
    go: (href: string, options?: { replace?: boolean }) => {
      if (
        !window.dispatchEvent(
          new Event("forman:before-navigate", { cancelable: true }),
        )
      )
        return;
      navigateWhenReachable(() =>
        options?.replace
          ? router.replace(href, { scroll: false })
          : router.push(href),
      );
    },
    refresh: () => router.refresh(),
  };
}

export function useAppPathname() {
  return usePathname();
}
