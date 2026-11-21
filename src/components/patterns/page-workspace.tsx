"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { finishNavigationProgress } from "@/components/layout/navigation-progress";
import { focusPageHeading } from "@/client/focus-management";
import { Paper, Stack, Text } from "@mantine/core";

type PageWorkspaceProperties = {
  children: ReactNode;
  className?: string;
  navigationReady?: boolean;
  width?: "collection" | "detail";
};

type MetricCardProperties = {
  description: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

export function PageWorkspace({
  children,
  className,
  navigationReady = true,
  width = "detail",
}: PageWorkspaceProperties) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!navigationReady) return;
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        finishNavigationProgress();
        if (document.activeElement === document.body) focusPageHeading();
      });
    });
    return () => cancelAnimationFrame(firstFrame);
  }, [navigationReady, pathname, searchParams]);

  return (
    <Stack
      mx={0}
      w="100%"
      maw={width === "collection" ? undefined : 1280}
      miw={0}
      gap="lg"
      px={{ base: "md", sm: "lg", lg: "xl" }}
      py="lg"
      className={className}
      data-slot="page-workspace"
    >
      {children}
    </Stack>
  );
}

export function MetricCard({
  description,
  label,
  value,
}: MetricCardProperties) {
  return (
    <Paper
      component="section"
      withBorder
      p="md"
      radius="md"
      data-slot="metric-card"
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text mt="xs" size="xl" fw={600}>
        {value}
      </Text>
      <Text mt={4} size="sm" c="dimmed">
        {description}
      </Text>
    </Paper>
  );
}
