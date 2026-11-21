"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { HelpLabel } from "@/components/patterns/help-tooltip";

import {
  Box,
  Button,
  Group,
  Modal,
  Radio,
  Stack,
  TextInput,
} from "@mantine/core";
import { CircleAlert } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import { createSource } from "@/client/admin-api/sources";
import { AdminApiError } from "@/client/admin-api/client";
import { useAppNavigation } from "@/components/layout/app-link";

export function CreateSourceDialog({ trigger }: { trigger: ReactNode }) {
  const navigation = useAppNavigation();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const releaseDraft = useUnsavedChanges(open && draft);

  function close() {
    if (pending) return;
    setOpen(false);
    setDraft(false);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const type = data.get("type");
    if (
      !name ||
      name.length > 120 ||
      (type !== "one-shot" && type !== "session" && type !== "m2m")
    ) {
      setError("Enter a Source name of up to 120 characters.");
      nameInput.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const source = await createSource({ name, type });
      setOpen(false);
      setDraft(false);
      releaseDraft();
      navigation.go(`/app/sources/${source.sourceId}`);
    } catch (error) {
      setError(
        error instanceof AdminApiError && error.status === 409
          ? "A Source with this name already exists"
          : "The Source could not be created. Check the name and try again.",
      );
      requestAnimationFrame(() => nameInput.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Box component="span" display="inline-flex" onClick={() => setOpen(true)}>
        {trigger}
      </Box>
      <Modal
        opened={open}
        onClose={close}
        title="Create Source"
        size="lg"
        centered
        returnFocus
        closeOnEscape={!pending}
        closeOnClickOutside={!pending}
        withCloseButton={!pending}
      >
        <form onInput={() => setDraft(true)} onSubmit={submit}>
          <Stack gap="md">
            <TextInput
              label="Name"
              ref={nameInput}
              data-autofocus
              id="form-name"
              maxLength={120}
              name="name"
              required
              disabled={pending}
            />
            <Radio.Group
              name="type"
              label={
                <HelpLabel
                  label="Source type"
                  help="The Source type cannot be changed after creation."
                />
              }
              defaultValue="one-shot"
              onChange={() => setDraft(true)}
            >
              <Stack gap="md" mt="sm">
                {[
                  {
                    value: "one-shot",
                    label: "One-shot",
                    description:
                      "Receive a complete browser form in one submission.",
                  },
                  {
                    value: "session",
                    label: "Session",
                    description:
                      "Save and resume answers before submitting the completed form.",
                  },
                  {
                    value: "m2m",
                    label: "M2M",
                    description:
                      "Receive JSON from a trusted server using a bearer token.",
                  },
                ].map((option) => (
                  <Radio key={option.value} {...option} disabled={pending} />
                ))}
              </Stack>
            </Radio.Group>
            {error ? (
              <Alert
                color="red"
                title="Could not create Source"
                icon={<CircleAlert size={18} />}
                role="alert"
              >
                {error}
              </Alert>
            ) : null}
            <Group justify="flex-end">
              <Button
                disabled={pending}
                onClick={close}
                type="button"
                variant="default"
              >
                Cancel
              </Button>
              <Button disabled={pending} loading={pending} type="submit">
                {pending ? "Creating…" : "Create Source"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
