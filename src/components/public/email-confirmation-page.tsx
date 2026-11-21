"use client";

import { CircleCheckBig } from "lucide-react";
import { useState } from "react";

import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { AdminTheme } from "@/components/layout/admin-theme";

export function EmailConfirmationPage({
  capability,
  confirmationCtaLabel,
  confirmationText,
  invalid = false,
}: {
  capability: string;
  confirmationCtaLabel: string;
  confirmationText: string;
  invalid?: boolean;
}) {
  const [state, setState] = useState<
    "ready" | "submitting" | "invalid" | "completed"
  >(invalid ? "invalid" : "ready");
  const [completedText, setCompletedText] = useState("");

  async function confirm() {
    setState("submitting");
    try {
      const response = await fetch(
        `/confirmations/${encodeURIComponent(capability)}/confirm`,
        { method: "POST" },
      );
      const body = (await response.json()) as { completedText?: string };
      if (!response.ok || !body.completedText) {
        setState("invalid");
        return;
      }
      setCompletedText(body.completedText);
      setState("completed");
    } catch {
      setState("invalid");
    }
  }

  return (
    <AdminTheme>
      <Center component="main" mih="100dvh" p={{ base: "lg", sm: 48 }}>
        <Stack
          component="section"
          w="100%"
          maw={448}
          align="center"
          gap="xl"
          ta="center"
          py="xl"
          aria-live="polite"
          aria-busy={state === "submitting"}
        >
          {state === "completed" ? (
            <CircleCheckBig
              aria-hidden="true"
              className="size-12 text-emerald-600"
              strokeWidth={1.8}
            />
          ) : null}
          <Stack gap="sm" maw="100%">
            <Title order={1} style={{ overflowWrap: "anywhere" }}>
              {state === "completed"
                ? "Confirmation received"
                : state === "invalid"
                  ? "Confirmation unavailable"
                  : "Confirmation required"}
            </Title>
            <Text
              size="lg"
              c="dimmed"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {state === "completed"
                ? completedText
                : state === "invalid"
                  ? "This confirmation link is not or no longer valid."
                  : confirmationText}
            </Text>
          </Stack>
          {state === "ready" || state === "submitting" ? (
            <Button
              disabled={state === "submitting"}
              onClick={confirm}
              type="button"
              maw="100%"
              styles={{
                label: { whiteSpace: "normal", overflowWrap: "anywhere" },
                root: { height: "auto", minHeight: 36, paddingBlock: 8 },
              }}
            >
              {state === "submitting" ? "Confirming…" : confirmationCtaLabel}
            </Button>
          ) : null}
        </Stack>
      </Center>
    </AdminTheme>
  );
}
