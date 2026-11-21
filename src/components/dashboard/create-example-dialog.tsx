"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Divider, Flex, Group, Modal, Stack, Text } from "@mantine/core";
import { ExternalLink, Plus } from "lucide-react";
import { createExample } from "@/client/admin-api/examples";
import { AdminNotice } from "@/components/patterns/admin-notice";
import { AppLink } from "@/components/layout/app-link";
import type {
  ExampleInput,
  ExampleResponse,
} from "@/shared/contracts/examples";

export function CreateExampleDialog({
  create = createExample,
  onCreated,
}: {
  create?: (input: ExampleInput) => Promise<ExampleResponse>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ExampleInput["kind"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExampleResponse | null>(null);
  const resultLink = useRef<HTMLAnchorElement>(null);
  const errorNotice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result) resultLink.current?.focus();
  }, [result]);
  useEffect(() => {
    if (error) errorNotice.current?.focus();
  }, [error]);
  const busy = useRef(false);
  const requests = useRef<Partial<Record<ExampleInput["kind"], string>>>({});
  async function submit(kind: ExampleInput["kind"]) {
    if (busy.current) return;
    busy.current = true;
    setPending(kind);
    setError(null);
    const requestId = (requests.current[kind] ??= crypto.randomUUID());
    try {
      const response = await create({ kind, requestId });
      setResult(response);
      requests.current = {};
      onCreated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Example could not be created",
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  return (
    <>
      <Button
        variant="default"
        leftSection={<Plus size={16} aria-hidden="true" />}
        onClick={() => {
          setResult(null);
          setError(null);
          setOpen(true);
        }}
      >
        Create example
      </Button>
      <Modal
        opened={open}
        onClose={() => {
          if (!busy.current) setOpen(false);
        }}
        title={result ? result.name + " is ready" : "Create example"}
        size="md"
        centered
        closeOnClickOutside={!pending}
        closeOnEscape={!pending}
        withCloseButton={!pending}
      >
        {result ? (
          <Stack gap="md">
            {result.sampleStatus === "completed" ? (
              <>
                <Text size="sm">
                  Your example includes a Source, a Pipeline with an Inbox
                  Action, and a Built-in Form.
                </Text>
                <Text size="sm">
                  A sample response has been added to Submissions and Inbox.
                  Submit the {result.kind} to try it yourself.
                </Text>
              </>
            ) : (
              <AdminNotice color="yellow" title="Example created">
                {result.sampleStatus === "pending"
                  ? "The sample response is still processing. Check its Pipeline Run."
                  : "The sample response could not be processed. Check its Pipeline Run."}
              </AdminNotice>
            )}
            <Group justify="flex-end">
              <Button
                component={AppLink}
                variant="default"
                href={
                  result.sampleStatus === "completed"
                    ? "/app/inbox?sourceId=" +
                      encodeURIComponent(result.sourceId)
                    : "/app/pipeline-runs/" + encodeURIComponent(result.runId)
                }
                onClick={() => setOpen(false)}
              >
                {result.sampleStatus === "completed"
                  ? "View Inbox"
                  : "View Pipeline Run"}
              </Button>
              <Button
                component="a"
                ref={resultLink}
                href={"/pages/" + encodeURIComponent(result.pageId)}
                target="_blank"
                rel="noopener noreferrer"
                rightSection={<ExternalLink size={16} aria-hidden="true" />}
              >
                Open {result.kind}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="lg">
            <Text size="sm">
              Includes a Source, a Pipeline with an Inbox Action, a published
              form and one sample response.
            </Text>
            {error ? (
              <AdminNotice
                ref={errorNotice}
                tabIndex={-1}
                color="red"
                title="Example could not be created"
              >
                {error}
              </AdminNotice>
            ) : null}
            {(["form", "survey"] as const).map((kind, index) => (
              <Stack key={kind} gap="lg">
                {index > 0 ? <Divider /> : null}
                <Flex direction={{ base: "column", sm: "row" }} align={{ base: "stretch", sm: "center" }} justify="space-between" gap="md">
                  <Stack gap={4}>
                    <Text size="md" fw={600}>{kind === "form" ? "Form" : "Survey"}</Text>
                    <Text c="dimmed" size="sm">
                      {kind === "form" ? "Single-step contact form." : "Two steps with answers saved as you go."}
                    </Text>
                  </Stack>
                  <Button
                    variant="default"
                    style={{ flexShrink: 0 }}
                    disabled={pending !== null}
                    loading={pending === kind}
                    onClick={() => void submit(kind)}
                  >
                    Create {kind}
                  </Button>
                </Flex>
              </Stack>
            ))}
          </Stack>
        )}
      </Modal>
    </>
  );
}
