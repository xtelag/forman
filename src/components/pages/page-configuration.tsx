"use client";
import { FormFields, FormGroup } from "@/components/patterns/form-layout";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { HelpLabel } from "@/components/patterns/help-tooltip";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  EditorTabs,
  useEditorTabState,
  EditorTabPanel as Panel,
} from "@/components/patterns/editor-tabs";
import type { AdminPageDetail } from "@/shared/contracts/admin";
import {
  defaultPageTheme,
  type PagePresentation,
} from "@/shared/contracts/page";
import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import { notifySaved, SaveBar } from "@/components/patterns/save-bar";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import { parseFormJson, serializeFormJson } from "@/shared/form-json";
import {
  parsePageMessages,
  serializePageMessages,
} from "@/shared/page-messages-json";
import { FormEditor } from "./form-editor";
import { Check, Copy, Download } from "lucide-react";
import { SubmissionTagBadges } from "@/components/submissions/submission-tag-badges";
import { AppLink } from "@/components/layout/app-link";
import { PageQrCode, createPageQrDownloadSvg } from "./page-qr-code";
type Values = Pick<AdminPageDetail, "name" | "enabled" | "presentation"> & {
  formDefinition?: string;
  systemDefinition?: string;
};
type Section = "main" | "content" | "appearance" | "qr";
const keys: Record<Exclude<Section, "main">, (keyof PagePresentation)[]> = {
  content: [
    "language",
    "title",
    "description",
    "systemTexts",
    "fields",
    "fallbacks",
    "steps",
    "successText",
  ],
  appearance: ["theme", "logoUrl", "logoAlt"],
  qr: ["qrCaption"],
};
function pick(page: AdminPageDetail, section: Section): Values {
  if (section === "main")
    return {
      name: page.name,
      enabled: page.enabled,
      presentation: { successUrl: page.presentation?.successUrl },
    };
  return {
    name: "",
    enabled: false,
    ...(section === "content"
      ? {
          formDefinition: serializeFormJson(
            page.fields ?? [],
            page.presentation,
            page.sessionsEnabled ?? false,
          ),
          systemDefinition: serializePageMessages(
            page.presentation?.language ?? "en",
            page.presentation,
          ),
        }
      : {}),
    presentation: Object.fromEntries(
      keys[section]
        .filter((key) => page.presentation?.[key] !== undefined)
        .map((key) => [key, page.presentation![key]]),
    ),
  };
}
function TextField({
  label,
  value,
  onChange,
  type = "text",
  description,
  help,
  min,
  max,
}: {
  label: string;
  value?: string | number;
  onChange: (value: string) => void;
  type?: string;
  description?: string;
  help?: string;
  min?: number;
  max?: number;
}) {
  return (
    <TextInput
      id={"page-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
      label={
        help ? (
          <HelpLabel
            htmlFor={"page-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            label={label}
            help={help}
          />
        ) : (
          label
        )
      }
      labelProps={{ component: help ? "div" : "label" }}
      aria-label={label}
      type={type}
      value={value ?? ""}
      min={min}
      max={max}
      description={description}
      inputWrapperOrder={["label", "input", "description", "error"]}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextInput
      id={"page-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
      label={label}
      value={value}
      pattern="#[0-9a-fA-F]{6}"
      required
      withAsterisk={false}
      maxLength={7}
      spellCheck={false}
      placeholder="#000000"
      styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
      onChange={(event) => onChange(event.target.value)}
      leftSectionPointerEvents="all"
      leftSection={
        <Box
          component="input"
          type="color"
          aria-label={label + " picker"}
          w={24}
          h={24}
          p={0}
          bd={0}
          bg="transparent"
          style={{ cursor: "pointer" }}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
        />
      }
    />
  );
}
const formSections = [
  { value: "main", label: "Configuration" },
  { value: "content", label: "Content & fields" },
  { value: "messages", label: "Buttons & messages" },
  { value: "appearance", label: "Appearance" },
  { value: "qr", label: "QR" },
];

function EditorSection({
  title,
  section,
  baseline,
  hidden,
  save,
  children,
}: {
  title: string;
  section: Section;
  baseline: Values;
  hidden?: boolean;
  save: (section: Section, value: Values) => Promise<Values>;
  children: (
    value: Values,
    change: (value: Values) => void,
    footer: ReactNode,
  ) => ReactNode;
}) {
  const serialized = JSON.stringify(baseline);
  const [received, setReceived] = useState(serialized);
  const [draft, setDraft] = useState(baseline);
  const [original, setOriginal] = useState(serialized);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== original;
  if (received !== serialized) {
    setReceived(serialized);
    if (!dirty) {
      setDraft(baseline);
      setOriginal(serialized);
    } else if (
      section === "main" &&
      baseline.enabled !== JSON.parse(received).enabled
    ) {
      setDraft({ ...draft, enabled: baseline.enabled });
      setOriginal(
        JSON.stringify({ ...JSON.parse(original), enabled: baseline.enabled }),
      );
    }
  }
  useUnsavedChanges(dirty);
  const footer = (
    <Stack gap="sm">
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      <SaveBar
        dirty={dirty}
        pending={pending}
        label={"Save " + (section === "qr" ? "QR" : title.toLowerCase())}
      >
        {section === "content" ? (
          <Text size="sm" c="dimmed">
            Saves Content &amp; fields and Buttons &amp; messages together.
          </Text>
        ) : null}
      </SaveBar>
    </Stack>
  );
  const form = (
    <form
      hidden={hidden}
      noValidate={section === "content"}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!dirty || pending) return;
        setPending(true);
        setError("");
        try {
          const saved = await save(section, draft);
          setDraft(saved);
          setOriginal(JSON.stringify(saved));
          notifySaved(
            section === "content"
              ? "Form content saved"
              : section === "qr"
                ? "QR caption saved"
                : title + " saved",
          );
        } catch {
          setError(
            "The section could not be saved. Check the values and try again.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <Stack gap="md">
        <EditorRefreshNotice
          changed={dirty && original !== serialized}
          onReload={() => {
            setDraft(baseline);
            setOriginal(serialized);
          }}
        />
        <Box component="fieldset" disabled={pending} m={0} p={0} bd={0} miw={0}>
          <Stack gap="md">{children(draft, setDraft, footer)}</Stack>
        </Box>
        {section !== "content" ? footer : null}
      </Stack>
    </form>
  );
  if (section === "content") return form;
  return (
    <Panel value={section} title={title} forceMount framed={section !== "appearance"}>
      {form}
    </Panel>
  );
}
export function PageConfiguration({
  page,
  save,
  onSaved,
}: {
  page: AdminPageDetail;
  save: (pageId: string, values: Values) => Promise<AdminPageDetail>;
  onSaved?: (page: AdminPageDetail) => void;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    if (copyStatus !== "Public URL copied.") return;
    const timeout = setTimeout(() => setCopyStatus(""), 2000);
    return () => clearTimeout(timeout);
  }, [copyStatus]);
  const [qrError, setQrError] = useState("");
  const [current, setCurrent] = useState(page);
  const [received, setReceived] = useState(page);
  const latest = useRef(current);
  const saving = useRef(false);
  if (received !== page) {
    setReceived(page);
    if (page.updatedAt >= current.updatedAt) setCurrent(page);
  }
  useEffect(() => {
    latest.current = current;
  }, [current]);
  async function saveSection(section: Section, value: Values) {
    if (saving.current)
      throw new Error("Another section is saving. Try again.");
    saving.current = true;
    try {
      const base = latest.current;
      const presentation = { ...base.presentation };
      if (section === "main") {
        delete presentation.successUrl;
        if (value.presentation?.successUrl)
          presentation.successUrl = value.presentation.successUrl;
      }
      if (section !== "main") {
        for (const key of keys[section]) delete presentation[key];
        Object.assign(presentation, value.presentation);
      }
      if (section === "content") {
        delete presentation.title;
        delete presentation.description;
        Object.assign(
          presentation,
          parseFormJson(
            value.formDefinition ?? "",
            base.fields ?? [],
            base.sessionsEnabled ?? false,
          ),
        );
        const { systemTexts: overrides, successText } = parsePageMessages(
          value.systemDefinition ?? "",
          presentation.language ?? "en",
        );
        if (successText) presentation.successText = successText;
        else delete presentation.successText;
        if (Object.keys(overrides).length) presentation.systemTexts = overrides;
        else delete presentation.systemTexts;
      }
      const updated = await save(page.pageId, {
        name: section === "main" ? value.name : base.name,
        enabled: section === "main" ? value.enabled : base.enabled,
        presentation,
      });
      latest.current = updated;
      setCurrent(updated);
      onSaved?.(updated);
      return pick(updated, section);
    } finally {
      saving.current = false;
    }
  }
  function presentationChange(value: Values, set: (value: Values) => void) {
    return (key: keyof PagePresentation, next: unknown) => {
      const p = {
        ...value.presentation,
        [key]: next === "" ? undefined : next,
      };
      set({ ...value, presentation: p });
    };
  }
  // Downloads use the caption currently in the editor, saved or not.
  async function downloadQr(caption: string) {
    setQrError("");
    try {
      const svg = await createPageQrDownloadSvg(page.publicUrl, caption);
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `forman-${page.pageId}-qr.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setQrError("The QR code could not be downloaded. Try again.");
    }
  }
  const [activeTab, setActiveTab] = useEditorTabState(page.pageId, "main");
  return (
    <EditorTabs
      value={activeTab}
      onChange={setActiveTab}
      sections={formSections}
      label="Form sections"
    >
      <EditorSection
        title="Configuration"
        section="main"
        baseline={pick(current, "main")}
        save={saveSection}
      >
        {(value, set) => (
          <>
            <FormFields>
              <TextField
                label="Name"
                help="Shown only in the admin."
                value={value.name}
                onChange={(name) => set({ ...value, name })}
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Source
                </Text>
                <Anchor
                  component={AppLink}
                  href={"/app/sources/" + page.sourcePublicId}
                  size="sm"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {page.sourceName}
                </Anchor>
              </Stack>
            </FormFields>
            <TextInput
              id="public-page-url"
              label="Public URL"
              readOnly
              value={page.publicUrl}
              rightSectionPointerEvents="all"
              rightSection={
                <ActionIcon
                  type="button"
                  aria-label="Copy public URL"
                  variant="subtle"
                  color="gray"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(page.publicUrl)
                      .then(() => setCopyStatus("Public URL copied."))
                      .catch(() =>
                        setCopyStatus("Could not copy the public URL."),
                      )
                  }
                >
                  {copyStatus === "Public URL copied." ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                </ActionIcon>
              }
            />
            {copyStatus ? (
              <Text
                role="status"
                size="sm"
                c={copyStatus === "Public URL copied." ? "dimmed" : "red"}
              >
                {copyStatus}
              </Text>
            ) : null}
            <Checkbox
              label="Published"
              description="Available at the public URL when enabled."
              checked={value.enabled}
              onChange={(event) =>
                set({ ...value, enabled: event.currentTarget.checked })
              }
            />

              <TextField
                label="Redirect URL"
                type="url"
                value={value.presentation?.successUrl}
                onChange={(next) =>
                  presentationChange(value, set)("successUrl", next)
                }
                description="HTTPS redirect instead of a confirmation message."
              />
            {page.tags.length ? (
              <Box aria-label="Source tags">
                <SubmissionTagBadges tags={page.tags} />
              </Box>
            ) : null}
          </>
        )}
      </EditorSection>
      <EditorSection
        title="Form"
        section="content"
        hidden={activeTab !== "content" && activeTab !== "messages"}
        baseline={pick(current, "content")}
        save={saveSection}
      >
        {(value, set, footer) => (
          <FormEditor
            footer={footer}
            systemDefinition={value.systemDefinition ?? ""}
            changeSystemDefinition={(systemDefinition, language) =>
              set({
                ...value,
                systemDefinition,
                presentation: {
                  ...value.presentation,
                  ...(language ? { language } : {}),
                },
              })
            }
            definition={value.formDefinition ?? ""}
            changeDefinition={(formDefinition) =>
              set({ ...value, formDefinition })
            }
            page={current}
            value={value.presentation ?? {}}
          />
        )}
      </EditorSection>
      <EditorSection
        title="Appearance"
        section="appearance"
        baseline={pick(current, "appearance")}
        save={saveSection}
      >
        {(value, set) => {
          const p = value.presentation ?? {};
          const change = presentationChange(value, set);
          const theme = { ...defaultPageTheme, ...p.theme };
          return (
            <Stack gap="lg">
              <FormGroup legend="Colors">
                <Stack gap="sm">
                  <FormFields>
                    {(
                      [
                        ["background", "Page background"],
                        ["surface", "Form background"],
                        ["text", "Text color"],
                        ["button", "Button color"],
                        ["buttonText", "Button text color"],
                      ] as const
                    ).map(([key, label]) => (
                      <ColorField
                        key={key}
                        label={label}
                        value={theme[key]}
                        onChange={(next) =>
                          change("theme", { ...p.theme, [key]: next })
                        }
                      />
                    ))}
                  </FormFields>
                </Stack>
              </FormGroup>
              <FormGroup legend="Layout">
                <FormFields>
                  <TextField
                    label="Form width (480–960 px)"
                    type="number"
                    min={480}
                    max={960}
                    value={theme.width}
                    onChange={(next) =>
                      change("theme", { ...p.theme, width: Number(next) })
                    }
                  />
                  <NativeSelect
                    id="page-radius"
                    label="Corner radius"
                    value={String(theme.radius)}
                    onChange={(event) =>
                      change("theme", {
                        ...p.theme,
                        radius: Number(event.currentTarget.value),
                      })
                    }
                    data={[0, 8, 16].map((radius) => ({
                      value: String(radius),
                      label: radius + " px",
                    }))}
                  />
                </FormFields>
              </FormGroup>
              <FormGroup legend="Logo">
                <FormFields>
                  <TextField
                    label="Logo URL (HTTPS)"
                    type="url"
                    value={p.logoUrl}
                    onChange={(next) => change("logoUrl", next)}
                  />
                  <TextField
                    label="Logo alternative text"
                    value={p.logoAlt}
                    onChange={(next) => change("logoAlt", next)}
                  />
                </FormFields>
              </FormGroup>
            </Stack>
          );
        }}
      </EditorSection>
      <EditorSection
        title="QR"
        section="qr"
        baseline={pick(current, "qr")}
        save={saveSection}
      >
        {(value, set) => (
          <Group align="flex-start" gap="lg">
            <PageQrCode value={page.publicUrl} />
            <Stack gap="md" style={{ flex: "1 1 240px", minWidth: 0 }}>
              <TextField
                label="QR caption"
                value={value.presentation?.qrCaption}
                onChange={(next) =>
                  presentationChange(value, set)("qrCaption", next)
                }
                help="Optional text below the downloaded code."
              />
              <Button
                variant="default"
                type="button"
                leftSection={<Download size={16} />}
                style={{ alignSelf: "flex-start" }}
                onClick={() =>
                  void downloadQr(value.presentation?.qrCaption ?? "")
                }
              >
                Download QR
              </Button>
              {qrError ? (
                <Alert color="red" role="alert">
                  {qrError}
                </Alert>
              ) : null}
            </Stack>
          </Group>
        )}
      </EditorSection>
    </EditorTabs>
  );
}
