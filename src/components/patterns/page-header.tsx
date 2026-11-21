"use client";
import { ActionIcon, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { adminDocumentTitle } from "@/shared/document-title";

type PageHeaderProperties = {
  actions?: ReactNode;
  /** Detail pages link back to their collection, left of the title. */
  back?: { href: string; label: string };
  description?: ReactNode;
  /**
   * Browser tab title once the resource is known, for example
   * "Contact · Source". Route metadata supplies the fallback until then.
   */
  documentTitle?: string;
  /** Detail metadata, always below the title and status. */
  metadata?: ReactNode;
  /** Lifecycle state shown below the title, alongside metadata. */
  status?: ReactNode;
  title: ReactNode;
};

export function PageHeader({
  actions,
  back,
  description,
  documentTitle,
  metadata,
  status,
  title,
}: PageHeaderProperties) {
  useEffect(() => {
    if (documentTitle) document.title = adminDocumentTitle(documentTitle);
  }, [documentTitle]);
  return (
    <Group
      component="header"
      align="flex-start"
      justify="space-between"
      gap="md"
      data-slot="page-header"
    >
      <Group align="flex-start" gap="sm" wrap="nowrap" miw={0} flex="1 1 16rem">
        {back ? (
          <Tooltip
            label={back.label}
            events={{ hover: true, focus: true, touch: false }}
          >
            <ActionIcon
              component={AppLink}
              href={back.href}
              aria-label={back.label}
              size="lg"
              variant="subtle"
              color="gray"
              mt={2}
              style={{ flexShrink: 0 }}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
        ) : null}
        <Stack gap={4} miw={0} flex={1}>
          <Group gap="sm" wrap="wrap" align="center" miw={0}>
            <Title order={1} size="h2" style={{ overflowWrap: "anywhere" }}>
              {title}
            </Title>
          </Group>
          {status || metadata || description ? (
            <Group gap={6} wrap="wrap" data-slot="page-header-metadata" style={{ overflowWrap: "anywhere" }}>
              {status}
              {status && (metadata || description) ? <Text component="span" size="sm" c="dimmed" aria-hidden="true">·</Text> : null}
              {metadata ? <Text component="div" size="sm" c="dimmed">{metadata}</Text> : null}
              {metadata && description ? <Text component="span" size="sm" c="dimmed" aria-hidden="true">·</Text> : null}
              {description ? <Text component="div" size="sm" c="dimmed">{description}</Text> : null}
            </Group>
          ) : null}
        </Stack>
      </Group>
      {actions ? (
        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          {actions}
        </Group>
      ) : null}
    </Group>
  );
}
