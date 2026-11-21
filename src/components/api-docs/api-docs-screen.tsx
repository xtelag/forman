import { Text } from "@mantine/core";
import { PageHeader } from "@/components/patterns/page-header";
import { PageWorkspace } from "@/components/patterns/page-workspace";

export function ApiDocsScreen() {
  return (
    <PageWorkspace>
      <PageHeader title="API docs" />
      <Text size="sm" c="dimmed">Documentation will be added later.</Text>
    </PageWorkspace>
  );
}
