"use client";

import { Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { useId } from "react";
import type { AdminDashboardSummary as DashboardSummary } from "@/shared/contracts/admin";
import { AppLink } from "@/components/layout/app-link";

type SummaryMetric = {
  href: string;
  /** Color for a non-zero value that needs attention. Zero is never colored. */
  tone?: "red" | "yellow";
  label: string;
  /**
   * Time window of the count. Cards without one keep the line empty, so every
   * card has the same height and the numbers line up.
   */
  period?: "Last 24 hours";
  value: number;
};

function summaryMetrics(summary: DashboardSummary): SummaryMetric[] {
  return [
    {
      label: "Active Sources",
      value: summary.activeSourceCount,
      href: "/app/sources?status=active",
    },
    {
      label: "Stored Submissions",
      value: summary.totalSubmissionCount,
      href: "/app/submissions",
    },
    {
      label: "Submissions",
      period: "Last 24 hours",
      value: summary.submissionsLast24Hours,
      href: "/app/submissions?period=24h",
    },
    {
      label: "Failed Actions",
      period: "Last 24 hours",
      value: summary.failedActionCount,
      tone: "red",
      href: "/app/pipeline-runs?actionStatus=failed_24h",
    },
    {
      label: "Waiting Callbacks",
      value: summary.waitingCallbackCount,
      tone: "yellow",
      href: "/app/callbacks",
    },
  ];
}

function SummaryCard({ href, label, period, tone, value }: SummaryMetric) {
  const id = useId();
  return (
    <Paper
      component={AppLink}
      href={href}
      aria-labelledby={period ? `${id}-label ${id}-period` : `${id}-label`}
      aria-describedby={`${id}-value`}
      className="dashboard-summary-card"
      withBorder
      p="md"
      miw={0}
      data-slot="card"
    >
      <Stack gap={4} h="100%">
        <Text id={`${id}-label`} size="sm" c="dimmed" fw={500} style={{ overflowWrap: "anywhere" }}>
          {label}
        </Text>
        <Text
          id={`${id}-value`}
          size="30px"
          fw={600}
          lh={1.2}
          mt="auto"
          pt={4}
          c={value > 0 ? tone : undefined}
          style={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
        >
          {value}
        </Text>
        <Text id={`${id}-period`} size="xs" c="dimmed" aria-hidden={period ? undefined : true}>
          {period ?? "\u00a0"}
        </Text>
      </Stack>
    </Paper>
  );
}

export function DashboardSummary({ summary }: { summary: DashboardSummary }) {
  return (
    <SimpleGrid
      component="section"
      aria-label="Activity summary"
      cols={{ base: 2, md: 3, lg: 5 }}
      spacing="sm"
    >
      {summaryMetrics(summary).map((metric) => (
        <SummaryCard key={metric.href} {...metric} />
      ))}
    </SimpleGrid>
  );
}
