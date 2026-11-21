"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import { useMediaQuery } from "@mantine/hooks";
import { LocalDateTime } from "@/components/patterns/local-date-time";
import { SubmissionRowActions } from "@/components/submissions/submission-row-actions";
import {
  Anchor,
  Box,
  Button,
  Group,
  Stack,
  Text,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { TriangleAlertIcon } from "lucide-react";

import { getDashboard } from "@/client/admin-api/dashboard";
import { useAdminResource } from "@/client/use-admin-resource";
import { CreateExampleDialog } from "@/components/dashboard/create-example-dialog";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { AdminResourceNotice } from "@/components/patterns/admin-resource-notice";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import { PageHeader } from "@/components/patterns/page-header";
import { PageState } from "@/components/patterns/page-state";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { ResourceTable } from "@/components/patterns/resource-table";
import { ResourceSection } from "@/components/patterns/resource-section";
import {
  submissionDetailPath,
  submissionTableColumns,
} from "@/components/submissions/submission-table-columns";
import type { AdminDashboardResponse } from "@/shared/contracts/admin";

type DashboardScreenProperties = {
  loadDashboard?: () => Promise<AdminDashboardResponse>;
};

function RecentSubmissions({
  dashboard,
  onChanged,
}: {
  dashboard: AdminDashboardResponse;
  onChanged: () => void;
}) {
  const navigation = useAppNavigation();
  const mobile = useMediaQuery("(max-width: 61.99em)");
  if (dashboard.summary.recentSubmissions.length === 0) {
    return (
      <PageState embedded title="No Submissions yet" variant="empty">
        Submissions will appear here after a Source receives data.
      </PageState>
    );
  }

  if (mobile) {
    return (
      <Stack
        component="ul"
        aria-label="Recent Submissions"
        gap={0}
        m={0}
        p={0}
        style={{ listStyle: "none" }}
      >
        {dashboard.summary.recentSubmissions
          .slice(0, 5)
          .map((submission, index) => (
            <Box
              component="li"
              key={submission.id}
              style={
                index
                  ? {
                      borderTop:
                        "1px solid var(--mantine-color-default-border)",
                    }
                  : undefined
              }
            >
              <UnstyledButton
                component={AppLink}
                href={submissionDetailPath(submission.id, "/app")}
                display="block"
                w="100%"
                px={0}
                py="sm"
              >
                <Text size="sm" fw={500} lineClamp={2}>
                  {submission.sourceName}
                </Text>
                <Group gap="xs" justify="space-between" mt={4}>
                  <Text size="xs" c="dimmed">
                    <LocalDateTime value={submission.createdAt} />
                  </Text>
                  <Text size="xs" c="dimmed">
                    {submission.state === "draft"
                      ? "Draft"
                      : submission.state === "expired"
                        ? "Expired"
                        : "Completed"}
                  </Text>
                </Group>
              </UnstyledButton>
            </Box>
          ))}
      </Stack>
    );
  }

  return (
    <ResourceTable

      ariaLabel="Recent Submissions"
      columns={[
        ...submissionTableColumns(),
        {
          id: "actions",
          label: <VisuallyHidden>Actions</VisuallyHidden>,
          sizing: "action",
          mobileAction: true,
          render: (submission) => (
            <SubmissionRowActions
              submission={submission}
              returnTo="/app"
              onDeleted={onChanged}
            />
          ),
        },
      ]}
      onRowClick={(submission) =>
        navigation.go(submissionDetailPath(submission.id, "/app"))
      }
      embedded
      getRowKey={(submission) => submission.id}
      items={dashboard.summary.recentSubmissions}
    />
  );
}

export function DashboardScreen({
  loadDashboard = getDashboard,
}: DashboardScreenProperties) {
  const mobile = useMediaQuery("(max-width: 61.99em)");
  const dashboard = useAdminResource(loadDashboard, undefined, {
    policy: "ambient",
  });
  const header = (
    <PageHeader
      title="Dashboard"
      actions={
        dashboard.data ? (
          <CreateExampleDialog onCreated={dashboard.refresh} />
        ) : undefined
      }
    />
  );

  if (dashboard.loading) {
    return (
      <PageWorkspace navigationReady={false} width="collection">
        {header}
        <PageState title="Loading dashboard" variant="loading" />
      </PageWorkspace>
    );
  }

  if (dashboard.error || !dashboard.data) {
    return (
      <PageWorkspace width="collection">
        {header}
        <PageState
          action={
            <Button onClick={dashboard.refresh} type="button">
              Try again
            </Button>
          }
          title="Dashboard could not be loaded"
          variant="error"
        />
      </PageWorkspace>
    );
  }

  return (
    <PageWorkspace width="collection">
      {header}
      <AdminResourceNotice resource={dashboard} />
      {dashboard.data.isInitialPassword ? (
        <Alert
          color="yellow"
          variant="light"
          role="alert"
          data-variant="warning"
          icon={<TriangleAlertIcon size={18} aria-hidden="true" />}
        >
          Initial password is still active.{" "}
          <Anchor
            component={AppLink}
            href="/app/settings#password"
            inherit
            c="inherit"
            fw={600}
            underline="always"
          >
            Change the password
          </Anchor>
          .
        </Alert>
      ) : null}
      <DashboardSummary summary={dashboard.data.summary} />
      <ResourceSection
        actions={
          !mobile && dashboard.data.summary.totalSubmissionCount > 0 ? (
            <Button
              component={AppLink}
              href="/app/submissions"
              variant="default"
            >
              View all Submissions
            </Button>
          ) : undefined
        }
        contentClassName={
          dashboard.data.summary.recentSubmissions.length > 0
            ? "p-0"
            : undefined
        }

        title="Recent Submissions"
      >
        <RecentSubmissions
          onChanged={dashboard.refresh}
          dashboard={dashboard.data}
        />
        {mobile && dashboard.data.summary.totalSubmissionCount > 0 ? (
          <Group justify="flex-end" pt="sm">
            <Button
              component={AppLink}
              href="/app/submissions"
              variant="default"
            >
              View all Submissions
            </Button>
          </Group>
        ) : null}
      </ResourceSection>
    </PageWorkspace>
  );
}
