import { Box, Flex, Text } from "@mantine/core";
import type { ReactNode } from "react";

export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Flex direction={{ base: "column", sm: "row" }} align="flex-start"
      gap={{ base: 4, sm: "md" }} miw={0} style={{ overflowWrap: "anywhere" }}>
      <Text component="dt" size="sm" fw={500} c="dimmed"
        w={{ base: "100%", sm: 180 }} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Box component="dd" m={0} miw={0} flex={1} fz="sm">{children}</Box>
    </Flex>
  );
}
