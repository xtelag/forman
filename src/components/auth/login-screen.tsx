"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";

import {
  Box,
  Button,
  Center,
  Flex,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { FormanBrand } from "@/components/brand/forman-brand";
import { AdminTheme } from "@/components/layout/admin-theme";

type LoginScreenProperties = {
  error?: "invalid";
  passwordChanged?: boolean;
  sessionExpired?: boolean;
};

export function LoginScreen({
  error,
  passwordChanged = false,
  sessionExpired = false,
}: LoginScreenProperties) {
  return (
    <AdminTheme>
      <Flex component="main" mih="100dvh">
        <Center
          component="section"
          visibleFrom="lg"
          w="33.333%"
          bg="violet.9"
          c="white"
          p="xl"
          data-testid="authentication-brand-panel"
        >
          <Stack align="center" gap="xl" maw={360} ta="center">
            <Box style={{ filter: "brightness(0) invert(1)" }}>
              <FormanBrand />
            </Box>
            <Text size="xl">The Swiss Army knife for forms and surveys.</Text>
          </Stack>
        </Center>
        <Center
          component="section"
          w={{ base: "100%", lg: "66.667%" }}
          p={{ base: "lg", sm: "xl" }}
          py={64}
        >
          <Stack w="100%" maw={400} gap="xl">
            <Stack gap="sm" ta="center">
              <Title order={1}>Login</Title>
              <Text c="dimmed" role={sessionExpired ? "status" : undefined}>
                {sessionExpired
                  ? "Signed out. Sign in again to continue."
                  : "Enter administrator credentials to continue."}
              </Text>
            </Stack>
            <Stack gap="md">
              {error === "invalid" ? (
                <Alert color="red" role="alert">
                  The username or password is invalid.
                </Alert>
              ) : null}
              {passwordChanged ? (
                <Alert color="green" aria-live="polite" role="status">
                  Password changed. Sign in again to continue.
                </Alert>
              ) : null}
              <form action="/api/admin/v1/auth/login" method="post">
                <Stack gap="md">
                  <TextInput
                    label="Username"
                    autoComplete="username"
                    defaultValue="forman"
                    id="username"
                    name="username"
                    required
                    withAsterisk={false}
                  />
                  <TextInput
                    type="password"
                    label="Password"
                    autoComplete="current-password"
                    id="password"
                    name="password"
                    required
                    withAsterisk={false}
                  />
                  <Button fullWidth type="submit">
                    Login
                  </Button>
                </Stack>
              </form>
            </Stack>
          </Stack>
        </Center>
      </Flex>
    </AdminTheme>
  );
}
