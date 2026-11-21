"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import {
  Box,
  Center,
  Group,
  ThemeIcon,
  Loader,
  Paper,
  Stack,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { loadingIndicatorDelay } from "@/components/layout/navigation-progress";

type PageStateProperties = {
  embedded?: boolean;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  title: ReactNode;
  variant: "empty" | "error" | "loading";
};

export function PageState({
  embedded = false,
  action,
  children,
  className,
  title,
  variant,
}: PageStateProperties) {
  if (variant === "loading")
    return <DelayedLoadingState className={className} title={title} />;
  const textContent = (
    <Stack gap="sm">
      <Text component="h2" size="sm" fw={600}>
        {title}
      </Text>
      {children ? (
        <Text component="div" size="sm" c="dimmed">
          {children}
        </Text>
      ) : null}
      {action ? <Box mt="xs">{action}</Box> : null}
    </Stack>
  );
  const content = variant === "empty" ? (
    <Group align="flex-start" gap="md" wrap="nowrap">
      <ThemeIcon variant="transparent" color="gray" size={24} aria-hidden="true">
        <Inbox size={20} />
      </ThemeIcon>
      <Box miw={0}>{textContent}</Box>
    </Group>
  ) : textContent;
  if (variant === "error")
    return (
      <Alert
        color="red"
        variant="light"
        role="alert"
        aria-live="assertive"
        className={className}
        data-slot="page-state"
      >
        {content}
      </Alert>
    );
  if (embedded) {
    return (
      <Box component="section" className={className} data-slot="page-state" role="status" aria-live="polite">
        {content}
      </Box>
    );
  }
  return (
    <Paper
      component="section"
      withBorder
      p="md"
      className={className}
      data-slot="page-state"
      role="status"
      aria-live="polite"
    >
      {content}
    </Paper>
  );
}

function DelayedLoadingState({
  className,
  title,
}: {
  className?: string;
  title: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setVisible(true),
      loadingIndicatorDelay,
    );
    return () => window.clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  return (
    <Center
      mih={160}
      className={className}
      data-slot="page-state"
      role="status"
      aria-live="polite"
    >
      <Loader
        type="dots"
        size="sm"
        aria-hidden="true"
        data-testid="page-state-loader"
      />
      <VisuallyHidden>{title}</VisuallyHidden>
    </Center>
  );
}
