"use client";

import {
  Box,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  VisuallyHidden,
} from "@mantine/core";

export function CollectionSkeleton({ label }: { label: string }) {
  return (
    <Box
      component="section"
      aria-busy="true"
      aria-live="polite"
      data-slot="collection-loading-skeleton"
      role="status"
    >
      <VisuallyHidden>{label}</VisuallyHidden>
      <Box aria-hidden="true">
        <Group gap="xs" mb="lg">
          {[112, 96, 80].map((width) => (
            <Skeleton height={36} width={width} key={width} />
          ))}
        </Group>
        <Paper withBorder visibleFrom="md">
          {Array.from({ length: 7 }, (_, row) => (
            <Box key={row}>
              {row > 0 ? <Divider /> : null}
              <SimpleGrid cols={5} spacing="md" p="md">
                {Array.from({ length: 5 }, (_, col) => (
                  <Skeleton height={16} key={col} />
                ))}
              </SimpleGrid>
            </Box>
          ))}
        </Paper>
        <Paper withBorder hiddenFrom="md">
          {Array.from({ length: 3 }, (_, row) => (
            <Box key={row}>
              {row > 0 ? <Divider /> : null}
              <Stack gap="sm" p="md">
                <Skeleton height={16} width="40%" />
                <Skeleton height={16} />
                <Skeleton height={16} width="80%" />
              </Stack>
            </Box>
          ))}
        </Paper>
      </Box>
    </Box>
  );
}
