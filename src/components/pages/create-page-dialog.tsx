"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { HelpLabel } from "@/components/patterns/help-tooltip";

import { useUnsavedChanges } from "@/client/use-unsaved-changes";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { createPage, type AdminPageDetail } from "@/client/admin-api/pages";
import {
  listSources,
  type AdminSourceSummary,
} from "@/client/admin-api/sources";
import { AppLink, useAppNavigation } from "@/components/layout/app-link";
import {
  Anchor,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";

export function CreatePageDialog({
  create = createPage,
  loadSources = listSources,
  initialSourceId = "",
  initiallyOpen = false,
}: {
  create?: (input: {
    sourceId: string;
    name: string;
  }) => Promise<Pick<AdminPageDetail, "pageId">>;
  loadSources?: () => Promise<AdminSourceSummary[]>;
  initialSourceId?: string;
  initiallyOpen?: boolean;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  const navigation = useAppNavigation();
  const [error, setError] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState(false);
  const [reloadSources, setReloadSources] = useState(0);
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [sources, setSources] = useState<AdminSourceSummary[]>([]);
  const [open, setOpen] = useState(initiallyOpen);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(false);
  const releaseDraft = useUnsavedChanges(open && draft);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const pageSources = sources.filter(
    (source) =>
      source.type !== "m2m" &&
      source.fieldDefinitionMode !== null &&
      source.fieldDefinitionSource !== null,
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadSources()
      .then((items) => {
        if (active) setSources(items);
      })
      .catch(() => {
        if (active) setSourceError(true);
      })
      .finally(() => {
        if (active) setLoadingSources(false);
      });
    return () => {
      active = false;
    };
  }, [loadSources, open, reloadSources]);

  function setDialogOpen(next: boolean) {
    if (pending) return;
    if (next) {
      setLoadingSources(true);
      setSourceError(false);
    }
    setOpen(next);
    if (!next) setDraft(false);
    if (!next) {
      setError(null);
      setSourceId(initialSourceId);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(
      new FormData(event.currentTarget).get("name") ?? "",
    ).trim();
    if (!name || !pageSources.some((source) => source.id === sourceId)) {
      setError("Enter an internal name and choose a Source.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const page = await create({ sourceId, name });
      setOpen(false);
      releaseDraft();
      navigation.go(`/app/pages/${encodeURIComponent(page.pageId)}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The Built-in Form could not be created.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>Create Built-in Form</Button>
      <Modal
        opened={open}
        onClose={() => setDialogOpen(false)}
        title="Create Built-in Form"
        centered
        size="md"
        closeOnEscape={!pending}
        closeOnClickOutside={!pending}
        withCloseButton={!pending}
      >
        <form onInput={() => setDraft(true)} onSubmit={submit}>
          <Stack gap="md">
            <TextInput
              label={
                <HelpLabel
                  required
                  htmlFor="page-name"
                  label="Name"
                  help="Shown only in the admin."
                />
              }
              disabled={pending}
              labelProps={{ component: "div" }}
              aria-label="Name"
              withAsterisk={false}
              id="page-name"
              maxLength={120}
              name="name"
              required
              data-autofocus
            />
            <Select
              label={
                <HelpLabel
                  htmlFor="page-source"
                  label="Source"
                  help="Requires a One-shot or Session Source with configured fields."
                />
              }
              labelProps={{ component: "div" }}
              aria-label="Source"
              id="page-source"
              searchable
              disabled={
                pending ||
                loadingSources ||
                sourceError ||
                pageSources.length === 0
              }
              value={sourceId || null}
              onChange={(value) => {
                setSourceId(value ?? "");
                setDraft(true);
              }}
              placeholder={
                loadingSources ? "Loading Sources…" : "Choose a Source"
              }
              data={pageSources.map((source) => ({
                value: source.id,
                label: source.name,
              }))}
              nothingFoundMessage="No matching Sources"
            />
            {!loadingSources && !sourceError && pageSources.length === 0 ? (
              <Text size="sm" c="dimmed">
                Configure fields on a{" "}
                <Anchor component={AppLink} href="/app/sources" size="sm">
                  Source
                </Anchor>{" "}
                before creating a Built-in Form.
              </Text>
            ) : null}
            {sourceError ? (
              <Alert color="red" role="alert">
                <Stack gap="sm">
                  <Text size="sm">Sources could not be loaded.</Text>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => {
                      setLoadingSources(true);
                      setSourceError(false);
                      setReloadSources((value) => value + 1);
                    }}
                  >
                    Try again
                  </Button>
                </Stack>
              </Alert>
            ) : null}
            {error ? (
              <Alert
                ref={errorRef}
                tabIndex={-1}
                styles={{ root: { outline: "none" } }}
                color="red"
                icon={<CircleAlert size={18} />}
                title="Could not create the Built-in Form"
                role="alert"
              >
                {error}
              </Alert>
            ) : null}
            <Group justify="flex-end">
              <Button
                variant="default"
                type="button"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  pending ||
                  loadingSources ||
                  sourceError ||
                  !pageSources.some((source) => source.id === sourceId)
                }
                loading={pending}
                type="submit"
              >
                {pending ? "Creating…" : "Create Built-in Form"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
