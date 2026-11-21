"use client";

import { Box, Button, Center, Flex, Stack, Text, Title } from "@mantine/core";
import { AdminTheme } from "@/components/layout/admin-theme";
import type { ReactNode } from "react";

type PublicStatePageProperties = {
  action?: { href: string; label: string; outline?: boolean };
  centered?: boolean;
  description: string;
  icon: ReactNode;
  title: string;
};

export function PublicStatePage({
  action,
  centered = false,
  description,
  icon,
  title,
}: PublicStatePageProperties) {
  return (
    <AdminTheme>
      <Flex component="main" mih="100dvh">
        <Center
          component="section"
          w={centered ? "100%" : { base: "100%", lg: "50%" }}
          p={{ base: "lg", sm: 48 }}
        >
          <Stack
            w="100%"
            maw={448}
            gap="xl"
            align={centered ? "center" : "flex-start"}
            ta={centered ? "center" : "left"}
            py="xl"
          >
            {centered ? <Box aria-hidden="true">{icon}</Box> : null}
            <Stack gap="sm" maw="100%">
              <Title order={1} style={{ overflowWrap: "anywhere" }}>
                {title}
              </Title>
              <Text size="lg" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                {description}
              </Text>
            </Stack>
            {action ? (
              <Button
                component="a"
                href={action.href}
                referrerPolicy="no-referrer"
                variant={action.outline ? "default" : "filled"}
                maw="100%"
                styles={{
                  label: { whiteSpace: "normal", overflowWrap: "anywhere" },
                  root: { height: "auto", minHeight: 36, paddingBlock: 8 },
                }}
              >
                {action.label}
              </Button>
            ) : null}
          </Stack>
        </Center>
        {centered ? null : (
          <Center
            component="section"
            aria-hidden="true"
            visibleFrom="lg"
            w="50%"
            bg="violet.9"
            c="white"
            p="xl"
          >
            {icon}
          </Center>
        )}
      </Flex>
    </AdminTheme>
  );
}
