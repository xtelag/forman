"use client";

import { AppShell as MantineAppShell, Drawer } from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";
import { focusPageHeading } from "@/client/focus-management";
import { installNavigationGuard } from "@/client/use-unsaved-changes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppPathname } from "@/components/layout/app-link";
import {
  NavigationProgress,
  NavigationProgressProvider,
} from "@/components/layout/navigation-progress";
import { AdminTheme } from "@/components/layout/admin-theme";
import { AdminSessionGuard } from "@/components/auth/admin-session-guard";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { ConnectionBanner } from "@/components/layout/connection-banner";

type ShellProps = {
  children: ReactNode;
  runtimeMode: "development" | "production" | "test";
  version: string;
};

function ShellContent({ children, runtimeMode, version }: ShellProps) {
  const pathname = useAppPathname();
  const isMobile = useIsMobile();
  const [mobileNavigation, setMobileNavigation] = useState({
    pathname,
    opened: false,
  });
  const mobileOpened =
    mobileNavigation.pathname === pathname && mobileNavigation.opened;
  const setMobileOpened = (opened: boolean) =>
    setMobileNavigation({ pathname, opened });
  if (mobileNavigation.pathname !== pathname) {
    setMobileNavigation({ pathname, opened: false });
  }
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  useEffect(installNavigationGuard, []);
  useEffect(() => {
    const frame = requestAnimationFrame(focusPageHeading);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const sidebar = (
    <AppSidebar
      pathname={pathname}
      runtimeMode={runtimeMode}
      version={version}
    />
  );
  return (
    <NavigationProgressProvider>
      <MantineAppShell
        zIndex={30}
        header={{ height: 64 }}
        navbar={{
          width: 240,
          breakpoint: "sm",
          collapsed: { mobile: true, desktop: desktopCollapsed },
        }}
        padding={0}
      >
        <MantineAppShell.Header>
          <AppTopbar
            navigationOpened={isMobile ? mobileOpened : !desktopCollapsed}
            onToggleNavigation={() =>
              isMobile
                ? setMobileOpened(!mobileOpened)
                : setDesktopCollapsed((value) => !value)
            }
          />
          <NavigationProgress />
        </MantineAppShell.Header>
        {!isMobile ? (
          <MantineAppShell.Navbar p="md" visibleFrom="sm">
            {sidebar}
          </MantineAppShell.Navbar>
        ) : null}
        <MantineAppShell.Main miw={0}>
          <ConnectionBanner />
          <AdminSessionGuard />
          {children}
        </MantineAppShell.Main>
      </MantineAppShell>
      <Drawer
        opened={isMobile && mobileOpened}
        onClose={() => setMobileOpened(false)}
        title="Navigation"
        size={280}
        padding="md"
        returnFocus
      >
        {sidebar}
      </Drawer>
    </NavigationProgressProvider>
  );
}

export function AppShell(props: ShellProps) {
  return (
    <AdminTheme>
      <ShellContent {...props} />
    </AdminTheme>
  );
}
