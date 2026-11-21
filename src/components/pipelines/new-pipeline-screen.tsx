"use client";
import { validateActionFields } from "./action-field-validation";
import { ActionSummary } from "./action-summary";
import layout from "./pipeline-layout.module.css";
import { PageState } from "@/components/patterns/page-state";
import { FormFields, FormGroup, formWidth } from "@/components/patterns/form-layout";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import { HelpLabel } from "@/components/patterns/help-tooltip";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { notifySaved, SaveBar } from "@/components/patterns/save-bar";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  InputLabel as Label,
  Menu,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput as Input,
  Title,
  Tooltip,
} from "@mantine/core";
import { ArrowDown, ArrowUp, CircleAlert, Plus, Trash2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AdminApiError } from "@/client/admin-api/client";
import { useUnsavedChanges } from "@/client/use-unsaved-changes";
import {
  createPipelineAction,
  deletePipelineAction,
  movePipelineAction,
  type AdminPipelineDetail,
  type PipelineActionInput,
  updatePipelineAction,
  updatePipelineConfiguration,
} from "@/client/admin-api/pipelines";
import { ActionConditionEditor } from "./action-condition-editor";
import { RowActionsMenu } from "@/components/patterns/row-actions-menu";
import { PipelineActionsMenu } from "./pipeline-actions-menu";
import { PageHeader } from "@/components/patterns/page-header";
import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";
import {
  EditorAccordion,
  EditorSection,
} from "@/components/patterns/editor-accordion";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { StatusBadge } from "@/components/patterns/status-badge";
import { useAccordionState } from "@/hooks/use-accordion-state";
type ActionConfiguration = {
  database?: string;
  username?: string;
  password?: string;
  passwordConfigured?: boolean;
  method?: "POST" | "PUT" | "PATCH" | "DELETE" | "GET" | "HEAD";
  authentication?: "none" | "bearer" | "basic";
  bearerToken?: string;
  bearerTokenConfigured?: boolean;
  expression?: string;
  field?: string;
  recipients?: string[];
  contentFormat?: "formatted" | "json";
  booleanField?: string;
  completedText?: string;
  confirmationCtaLabel?: string;
  confirmationText?: string;
  emailCtaLabel?: string;
  emailField?: string;
  emailText?: string;
  subject?: string;
  timeoutHours?: number;
  timeoutSeconds?: number;
  url?: string;
};

type DraftAction = Omit<PipelineActionInput, "configuration"> & {
  configuration: ActionConfiguration;
  key: number;
};

const actionTypes: Array<{
  label: string;
  type: PipelineActionInput["type"];
}> = [
  { label: "Transformation", type: "transformation" },
  { label: "Webhook", type: "webhook" },
  { label: "CouchDB", type: "couchdb" },
  { label: "Callback", type: "callback" },
  { label: "Callback Touch", type: "callback_boolean" },
  { label: "E-mail", type: "email" },
  { label: "Email Confirmation", type: "email_confirmation" },
  { label: "Inbox", type: "inbox" },
];

function configurationFor(
  type: PipelineActionInput["type"],
  sourceName = "",
): ActionConfiguration {
  if (type === "transformation") return { expression: "" };
  if (type === "couchdb")
    return { url: "", database: "", username: "", password: "" };
  if (type === "webhook") return { url: "" };
  if (type === "callback") return { timeoutSeconds: 86_400, url: "" };
  if (type === "callback_boolean")
    return { field: "", timeoutSeconds: 86_400, url: "" };
  if (type === "email")
    return { recipients: [], subject: sourceName, contentFormat: "formatted" };
  if (type === "email_confirmation")
    return {
      booleanField: "",
      completedText:
        "Confirmation has been received. This page can now be closed.",
      confirmationCtaLabel: "Confirm",
      confirmationText: "Confirm continuation.",
      emailCtaLabel: "Open confirmation",
      emailField: "",
      emailText: "Please use the button below to continue.",
      subject: "Confirmation required",
      timeoutHours: 24,
    };
  return {};
}

function defaultBlocking(type: PipelineActionInput["type"]) {
  return (
    type === "transformation" ||
    type === "callback" ||
    type === "callback_boolean" ||
    type === "email_confirmation"
  );
}

function actionTypeLabel(type: PipelineActionInput["type"]) {
  return (
    actionTypes.find((actionType) => actionType.type === type)?.label ?? type
  );
}

function actionRowProcessingSummary(action: DraftAction) {
  const blocking = action.blocking ?? defaultBlocking(action.type);
  const condition = action.condition
    ? action.conditionMissBehavior === "skip_remaining"
      ? "Conditional · skips remaining Actions"
      : "Conditional"
    : null;
  if (!blocking) return ["Non-blocking", condition].filter(Boolean).join(" · ");

  return [
    "Blocking",
    action.failurePolicy === "bypass" ? "Bypass" : "Cancel",
    `${action.maximumAttempts ?? 3} ${(action.maximumAttempts ?? 3) === 1 ? "attempt" : "attempts"}`,
    ...(condition ? [condition] : []),
  ].join(" · ");
}

function draftActionsFor(
  pipeline: AdminPipelineDetail | undefined,
): DraftAction[] {
  if (!pipeline) return [];
  return pipeline.steps.map((step, index) => ({
    blocking: step.blocking,
    condition: step.condition,
    conditionMissBehavior: step.conditionMissBehavior,
    configuration: step.configuration as ActionConfiguration,
    enabled: step.enabled,
    failurePolicy: step.failurePolicy ?? undefined,
    id: step.id,
    key: index + 1,
    maximumAttempts: step.maximumAttempts,
    name: step.name,
    type: step.type,
  }));
}

function PipelineEditor({
  freshnessNotice,
  pipeline,
}: {
  freshnessNotice?: ReactNode;
  pipeline: AdminPipelineDetail;
}) {
  const editing = true;
  const [expandedActions, setExpandedActions] = useAccordionState(
    `pipeline:${pipeline?.id ?? "new"}`,
  );
  const [actions, setActions] = useState<DraftAction[]>(() =>
    draftActionsFor(pipeline),
  );
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({});
  const [actionFieldErrors, setActionFieldErrors] = useState<
    Record<number, Record<string, string>>
  >({});
  const [actionPendingKey, setActionPendingKey] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(pipeline?.enabled ?? true);
  const [name, setName] = useState(pipeline?.name ?? "");
  const [pending, setPending] = useState(false);
  const [sourceId, setSourceId] = useState(pipeline?.sourceId ?? "");
  const configurationSnapshot = JSON.stringify({ enabled, name, sourceId });
  const [savedConfigurationSnapshot, setSavedConfigurationSnapshot] = useState(
    () => (pipeline ? configurationSnapshot : null),
  );
  const [savedActionSnapshots, setSavedActionSnapshots] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      actions
        .filter((action): action is DraftAction & { id: string } =>
          Boolean(action.id),
        )
        .map((action) => [action.id, JSON.stringify(actionInput(action))]),
    ),
  );
  const acceptedPipeline = useRef(JSON.stringify(pipeline));
  const [newerPipeline, setNewerPipeline] =
    useState<AdminPipelineDetail | null>(null);

  const savedEnabled = savedConfigurationSnapshot
    ? (JSON.parse(savedConfigurationSnapshot) as { enabled: boolean }).enabled
    : enabled;
  const readyToCreate = Boolean(name.trim() && sourceId);
  const hasUnsavedChanges = pipeline
    ? savedConfigurationSnapshot !== configurationSnapshot ||
      actions.some(
        (action) =>
          !action.id ||
          savedActionSnapshots[action.id] !==
            JSON.stringify(actionInput(action)),
      )
    : Boolean(name.trim() || sourceId);
  const configurationDirty = Boolean(
    pipeline && savedConfigurationSnapshot !== configurationSnapshot,
  );
  const actionsDirty = Boolean(
    pipeline &&
    actions.some(
      (action) =>
        !action.id ||
        savedActionSnapshots[action.id] !== JSON.stringify(actionInput(action)),
    ),
  );

  function acceptConfiguration(next: AdminPipelineDetail) {
    setEnabled(next.enabled);
    setName(next.name);
    setSourceId(next.sourceId);
    setSavedConfigurationSnapshot(
      JSON.stringify({
        enabled: next.enabled,
        name: next.name,
        sourceId: next.sourceId,
      }),
    );
  }

  function acceptActions(next: AdminPipelineDetail) {
    const nextActions = draftActionsFor(next);
    setActions(nextActions);
    setSavedActionSnapshots(
      Object.fromEntries(
        nextActions
          .filter((action): action is DraftAction & { id: string } =>
            Boolean(action.id),
          )
          .map((action) => [action.id, JSON.stringify(actionInput(action))]),
      ),
    );
  }

  useEffect(() => {
    if (!pipeline) return;
    const signature = JSON.stringify(pipeline);
    if (signature === acceptedPipeline.current) return;
    acceptedPipeline.current = signature;
    queueMicrotask(() => {
      if (configurationDirty || actionsDirty) setNewerPipeline(pipeline);
      if (!configurationDirty) acceptConfiguration(pipeline);
      if (!actionsDirty) acceptActions(pipeline);
    });
    // Local save boundaries intentionally determine which parts accept a baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionsDirty, configurationDirty, pipeline]);

  useUnsavedChanges(hasUnsavedChanges);
  const [actionToRemove, setActionToRemove] = useState<DraftAction | null>(
    null,
  );

  function updateAction(index: number, patch: Partial<PipelineActionInput>) {
    setActions((current) =>
      current.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...patch } : action,
      ),
    );
  }

  function updateActionConfiguration(
    index: number,
    patch: ActionConfiguration,
  ) {
    setActionErrors((current) => ({ ...current, [actions[index].key]: "" }));
    setActions((current) =>
      current.map((action, actionIndex) =>
        actionIndex === index
          ? { ...action, configuration: { ...action.configuration, ...patch } }
          : action,
      ),
    );
  }

  function updateActionType(index: number, type: PipelineActionInput["type"]) {
    setActionFieldErrors((current) => ({
      ...current,
      [actions[index].key]: {},
    }));
    setActionErrors((current) => ({ ...current, [actions[index].key]: "" }));
    setActions((current) =>
      current.map((action, actionIndex) =>
        actionIndex === index
          ? {
              ...action,
              blocking: defaultBlocking(type),
              configuration: configurationFor(type, pipeline.sourceName),
              failurePolicy: defaultBlocking(type) ? "cancel" : undefined,
              maximumAttempts: 3,
              type,
            }
          : action,
      ),
    );
  }

  function actionInput(action: DraftAction): PipelineActionInput {
    const blocking = action.blocking ?? defaultBlocking(action.type);
    return {
      blocking,
      ...(action.condition
        ? {
            condition: action.condition,
            conditionMissBehavior:
              action.conditionMissBehavior ?? "skip_action",
          }
        : {}),
      configuration: (action.type === "email"
        ? {
            ...action.configuration,
            recipients: (action.configuration.recipients ?? [])
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : action.configuration) as PipelineActionInput["configuration"],
      enabled: action.enabled ?? true,
      ...(blocking ? { failurePolicy: action.failurePolicy ?? "cancel" } : {}),
      maximumAttempts: action.maximumAttempts ?? 3,
      name: action.name.trim(),
      type: action.type,
    };
  }

  function replaceActions(
    detail: AdminPipelineDetail,
    expandedActionId?: string,
    savedDraftKey?: number,
    submittedInput?: PipelineActionInput,
  ) {
    const nextActions = draftActionsFor(detail);
    setActions((current) => {
      let nextKey = Math.max(0, ...current.map((action) => action.key));
      const merged = nextActions.map((serverAction) => {
        const local = current.find(
          (action) =>
            action.id === serverAction.id ||
            (savedDraftKey !== undefined &&
              action.key === savedDraftKey &&
              serverAction.id === expandedActionId),
        );
        if (!local) return { ...serverAction, key: ++nextKey };
        const baseline =
          submittedInput && serverAction.id === expandedActionId
            ? JSON.stringify(submittedInput)
            : savedActionSnapshots[serverAction.id!];
        const keepDraft = JSON.stringify(actionInput(local)) !== baseline;
        return {
          ...(keepDraft ? local : serverAction),
          id: serverAction.id,
          key: local.key,
        };
      });
      return [
        ...merged,
        ...current.filter(
          (action) => !action.id && action.key !== savedDraftKey,
        ),
      ];
    });
    setSavedActionSnapshots(
      Object.fromEntries(
        nextActions
          .filter((action): action is DraftAction & { id: string } =>
            Boolean(action.id),
          )
          .map((action) => [action.id, JSON.stringify(actionInput(action))]),
      ),
    );
  }

  async function saveAction(index: number) {
    if (!pipeline) return;
    const action = actions[index];
    const fields = document.getElementById("action-fields-" + action.key);
    if (!fields) return;
    const fieldErrors = validateActionFields(fields);
    setActionFieldErrors((current) => ({
      ...current,
      [action.key]: fieldErrors,
    }));
    setActionErrors((current) => ({ ...current, [action.key]: "" }));
    const firstInvalidId = Object.keys(fieldErrors)[0];
    if (firstInvalidId) {
      document.getElementById(firstInvalidId)?.focus();
      return;
    }

    setActionPendingKey(action.key);
    setActionErrors((current) => ({ ...current, [action.key]: "" }));
    try {
      const detail = action.id
        ? await updatePipelineAction(
            pipeline.id,
            action.id,
            actionInput(action),
          )
        : await createPipelineAction(pipeline.id, actionInput(action));
      const actionId = action.id ?? detail.steps.at(-1)?.id;
      replaceActions(
        detail,
        actionId,
        action.id ? undefined : action.key,
        actionInput(action),
      );
      notifySaved("Action saved");
    } catch (error) {
      setActionErrors((current) => ({
        ...current,
        [action.key]:
          error instanceof AdminApiError && error.status === 400
            ? error.message
            : "This Action could not be saved. Check the values and try again.",
      }));
    } finally {
      setActionPendingKey(null);
    }
  }

  async function moveAction(index: number, direction: "up" | "down") {
    const action = actions[index];
    if (!pipeline || !action.id) return;
    setActionErrors((current) => ({ ...current, [action.key]: "" }));
    setActionPendingKey(action.key);
    try {
      const detail = await movePipelineAction(
        pipeline.id,
        action.id,
        direction,
      );
      replaceActions(detail, action.id);
    } catch {
      setExpandedActions((current) =>
        current.includes(String(action.key))
          ? current
          : [...current, String(action.key)],
      );
      setActionErrors((current) => ({
        ...current,
        [action.key]: "This Action could not be moved. Try again.",
      }));
    } finally {
      setActionPendingKey(null);
    }
  }

  async function removeAction(index: number) {
    const action = actions[index];
    if (!action.id) {
      setActions((current) =>
        current.filter((_, actionIndex) => actionIndex !== index),
      );
      setActionToRemove(null);
      return;
    }
    if (!pipeline) return;
    setActionPendingKey(action.key);
    try {
      const detail = await deletePipelineAction(pipeline.id, action.id);
      replaceActions(detail);
      setActionToRemove(null);
    } catch {
      setActionErrors((current) => ({
        ...current,
        [action.key]: "This Action could not be removed. Try again.",
      }));
    } finally {
      setActionPendingKey(null);
    }
  }

  const [newActionKey, setNewActionKey] = useState<number | null>(null);
  useEffect(() => {
    if (newActionKey === null) return;
    const timer = window.setTimeout(() => {
      const input = document.getElementById(
        "pipeline-action-" + newActionKey + "-name",
      );
      input?.focus({ preventScroll: true });
      input?.scrollIntoView?.({ block: "center" });
    }, 250); // Wait for the accordion collapse (200 ms) before positioning the new field.
    return () => window.clearTimeout(timer);
  }, [newActionKey]);

  function addAction() {
    const key = Math.max(0, ...actions.map((action) => action.key)) + 1;
    setActions((current) => [
      ...current,
      {
        blocking: true,
        configuration: configurationFor("transformation"),
        key,
        name: "",
        type: "transformation",
      },
    ]);
    setExpandedActions([String(key)]);
    setNewActionKey(key);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!readyToCreate) {
      setError("Enter a Pipeline name and choose a Source.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await updatePipelineConfiguration(pipeline.id, {
        enabled,
        name: name.trim(),
      });
      setSavedConfigurationSnapshot(
        JSON.stringify({ enabled, name: name.trim(), sourceId }),
      );
      notifySaved("Pipeline saved");
    } catch {
      setError(
        `The Pipeline could not be ${editing ? "saved" : "created"}. Check the values and try again.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <PageWorkspace>
      <PageHeader
        back={{ href: "/app/pipelines", label: "Back to all Pipelines" }}
        documentTitle={pipeline.name + " · Pipeline"}
        metadata={`${pipeline.sourceName} · ID: ${pipeline.id}`}
        title={pipeline.name}
        status={
          <StatusBadge status={savedEnabled ? "success" : "inactive"}>
            {savedEnabled ? "Enabled" : "Disabled"}
          </StatusBadge>
        }
        actions={
          <Group gap="xs">
            <PipelineActionsMenu
              pipeline={{ ...pipeline, enabled: savedEnabled }}
              onStateChanged={(next) => {
                setEnabled(next);
                setSavedConfigurationSnapshot((previous) =>
                  previous
                    ? JSON.stringify({ ...JSON.parse(previous), enabled: next })
                    : previous,
                );
              }}
            />
          </Group>
        }
      />
      {freshnessNotice}
      <Paper withBorder radius="md" p="md" className={layout.configurationCard}>
        <form id="new-pipeline" onSubmit={submit}>
          <Stack gap="md">
            <EditorRefreshNotice
              changed={Boolean(newerPipeline) && configurationDirty}
              onReload={() => {
                if (!newerPipeline) return;
                acceptConfiguration(newerPipeline);
                setNewerPipeline(actionsDirty ? newerPipeline : null);
              }}
            />
            <div className={layout.configuration}>
              <Input
                className={layout.name}
                label="Name"
                id="pipeline-name"
                maxLength={120}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
                required
                withAsterisk={false}
                value={name}
              />
              <Checkbox
                className={layout.enabled}
                label="Enabled"
                id="pipeline-enabled"
                disabled={pending}
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              />
              <div className={layout.save}>
                <SaveBar
                  compact
                  dirty={configurationDirty}
                  disabled={!readyToCreate}
                  pending={pending}
                />
              </div>
            </div>
            {error ? (
              <Alert
                color="red"
                role="alert"
                title="Could not save Pipeline"
                icon={<CircleAlert size={18} />}
              >
                {error}
              </Alert>
            ) : null}
          </Stack>
        </form>
      </Paper>
      <Stack gap="lg" id="actions" className={layout.actions}>
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={2} size="h4">
              <HelpLabel
                label="Actions"
                help="Actions run from top to bottom."
              />
            </Title>
          </Stack>
          <Button
            disabled={pending || actions.length >= 50}
            onClick={addAction}
            variant="default"
            leftSection={<Plus size={16} />}
            type="button"
          >
            Add Action
          </Button>
        </Group>
        <EditorRefreshNotice
          changed={Boolean(newerPipeline) && actionsDirty}
          onReload={() => {
            if (!newerPipeline) return;
            acceptActions(newerPipeline);
            setNewerPipeline(configurationDirty ? newerPipeline : null);
          }}
        />
        {!actions.length ? (
          <PageState variant="empty" title="No Actions yet">
            Add an Action to process Submissions.
          </PageState>
        ) : null}
        <EditorAccordion
          chevronPosition="left"
          value={expandedActions}
          onChange={setExpandedActions}
          order={3}
        >
          {actions.map((action, index) => (
            <EditorSection
              key={action.key}
              value={String(action.key)}
              title={
                "Action " +
                (index + 1) +
                ": " +
                (action.name || "Untitled Action")
              }
              header={
                <ActionSummary
                  name={action.name || "Untitled Action"}
                  position={index + 1}
                  type={actionTypeLabel(action.type)}
                  processing={actionRowProcessingSummary(action)}
                  status={
                    <StatusBadge
                      status={
                        action.id && (action.enabled ?? true)
                          ? "success"
                          : "inactive"
                      }
                      subtle
                    >
                      {actionPendingKey === action.key
                        ? "Saving…"
                        : action.id
                          ? (action.enabled ?? true)
                            ? "Enabled"
                            : "Disabled"
                          : "Draft"}
                    </StatusBadge>
                  }
                />
              }
              actions={
                <Group gap={2} wrap="nowrap" pr="xs">
                  <Tooltip label="Move Action up">
                    <ActionIcon
                      aria-label={"Move Action " + (index + 1) + " up"}
                      disabled={
                        pending ||
                        actionPendingKey !== null ||
                        !action.id ||
                        index === 0
                      }
                      onClick={() => void moveAction(index, "up")}
                      variant="subtle"
                      color="gray"
                    >
                      <ArrowUp size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Move Action down">
                    <ActionIcon
                      aria-label={"Move Action " + (index + 1) + " down"}
                      disabled={
                        pending ||
                        actionPendingKey !== null ||
                        !action.id ||
                        index === actions.length - 1
                      }
                      onClick={() => void moveAction(index, "down")}
                      variant="subtle"
                      color="gray"
                    >
                      <ArrowDown size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <RowActionsMenu
                    label={"Actions for Action " + (index + 1)}
                    disabled={pending || actionPendingKey !== null}
                  >
                    <Menu.Item
                      color="red"
                      leftSection={<Trash2 size={16} />}
                      onClick={() => setActionToRemove(action)}
                    >
                      Remove Action
                    </Menu.Item>
                  </RowActionsMenu>
                </Group>
              }
            >
              <Stack gap="md" w="100%" maw={formWidth}>
                <Box
                  component="fieldset"
                  id={"action-fields-" + action.key}
                  onChangeCapture={(event) => {
                    const id =
                      event.target instanceof HTMLElement
                        ? event.target.id
                        : "";
                    setActionFieldErrors((current) => {
                      if (!current[action.key]?.[id]) return current;
                      const next = { ...current[action.key] };
                      delete next[id];
                      return { ...current, [action.key]: next };
                    });
                  }}
                  disabled={pending || actionPendingKey === action.key}
                  m={0}
                  p={0}
                  bd={0}
                  miw={0}
                >
                  <Stack gap="lg">
                    <FormGroup legend="General">
                    <FormFields>
                      <Input
                        label="Name"
                        aria-label={"Action " + (index + 1) + " name"}
                        id={"pipeline-action-" + action.key + "-name"}
                        error={
                          actionFieldErrors[action.key]?.[
                            "pipeline-action-" + action.key + "-name"
                          ]
                        }
                        maxLength={120}
                        required
                        value={action.name}
                        onChange={(event) =>
                          updateAction(index, { name: event.target.value })
                        }
                      />
                      <Select
                        label="Type"
                        aria-label={"Action " + (index + 1) + " type"}
                        id={"pipeline-action-" + action.key + "-type"}
                        value={action.type}
                        onChange={(value) => {
                          if (value)
                            updateActionType(
                              index,
                              value as PipelineActionInput["type"],
                            );
                        }}
                        data={actionTypes.map((item) => ({
                          value: item.type,
                          label: item.label,
                        }))}
                      />
                      <Checkbox
                        label="Enabled"
                        aria-label={"Enable Action " + (index + 1)}
                        id={"pipeline-action-" + action.key + "-enabled"}
                        checked={action.enabled ?? true}
                        onChange={(event) =>
                          updateAction(index, {
                            enabled: event.currentTarget.checked,
                          })
                        }
                      />
                    </FormFields>
                    </FormGroup>
                    {action.type !== "inbox" ? (
                      <FormGroup legend={action.type === "email" ? "Email" : actionTypeLabel(action.type)}>
                        <Stack gap="md">
                        {action.type === "transformation" ? (
                          <Stack gap={4}>
                            <Label
                              htmlFor={`pipeline-action-${action.key}-expression`}
                            >
                              Transformation (JSONata)
                            </Label>
                            <Textarea
                              autosize
                              minRows={3}
                              maxRows={14}
                              id={`pipeline-action-${action.key}-expression`}
                              onChange={(event) =>
                                updateActionConfiguration(index, {
                                  expression: event.target.value,
                                })
                              }
                              error={
                                actionErrors[action.key]?.includes("JSONata")
                                  ? actionErrors[action.key]
                                  : undefined
                              }
                              value={action.configuration.expression ?? ""}
                            />
                            <Text size="sm" c="dimmed">
                              Return an object containing only the payload
                              fields to add or overwrite.
                            </Text>
                          </Stack>
                        ) : null}
                        {action.type === "couchdb" ? (
                          <FormFields>
                            <Text
                              style={{ gridColumn: "1 / -1" }}
                              size="sm"
                              c="dimmed"
                            >
                              Archives the original Submission as a JSON
                              document. Retries verify the existing document;
                              archived data is never overwritten.
                            </Text>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-url`}
                              >
                                CouchDB server URL
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-url`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-url`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    url: event.target.value,
                                  })
                                }
                                required
                                type="url"
                                placeholder="https://couchdb.example.com"
                                value={action.configuration.url ?? ""}
                              />
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-database`}
                              >
                                Database
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-database`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-database`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    database: event.target.value,
                                  })
                                }
                                required
                                value={action.configuration.database ?? ""}
                              />
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-username`}
                              >
                                Username
                              </Label>
                              <Input
                                autoComplete="off"
                                id={`pipeline-action-${action.key}-username`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-username`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    username: event.target.value,
                                  })
                                }
                                required
                                value={action.configuration.username ?? ""}
                              />
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                required={
                                  !action.configuration.passwordConfigured
                                }
                                htmlFor={`pipeline-action-${action.key}-password`}
                              >
                                Password
                              </Label>
                              <Input
                                autoComplete="new-password"
                                id={`pipeline-action-${action.key}-password`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-password`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    password: event.target.value,
                                  })
                                }
                                required={
                                  !action.configuration.passwordConfigured
                                }
                                type="password"
                                placeholder={
                                  action.configuration.passwordConfigured
                                    ? "Saved — leave empty to keep"
                                    : ""
                                }
                                value={action.configuration.password ?? ""}
                              />
                            </Stack>
                          </FormFields>
                        ) : null}
                        {action.type === "webhook" ? (
                          <FormFields>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`webhook-method-${action.key}`}
                              >
                                HTTP method
                              </Label>
                              <Select
                                value={action.configuration.method ?? "POST"}
                                onChange={(next) => {
                                  if (next !== null)
                                    ((value) =>
                                      updateActionConfiguration(index, {
                                        method:
                                          value as ActionConfiguration["method"],
                                      }))(next);
                                }}
                                id={`webhook-method-${action.key}`}
                                data={[
                                  ...[
                                    "POST",
                                    "PUT",
                                    "PATCH",
                                    "DELETE",
                                    "GET",
                                    "HEAD",
                                  ].map((method) => ({
                                    value: method,
                                    label: method,
                                  })),
                                ]}
                              />
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                htmlFor={`pipeline-action-${action.key}-url`}
                              >
                                Webhook URL
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-url`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-url`
                                  ]
                                }
                                required
                                value={action.configuration.url ?? ""}
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    url: event.target.value,
                                  })
                                }
                              />
                            </Stack>
                            <Stack gap={4}>
                              <Label htmlFor={`webhook-auth-${action.key}`}>
                                Authentication
                              </Label>
                              <Select
                                value={
                                  action.configuration.authentication ??
                                  (action.configuration.bearerTokenConfigured
                                    ? "bearer"
                                    : "none")
                                }
                                onChange={(next) => {
                                  if (next !== null)
                                    ((value) =>
                                      updateActionConfiguration(index, {
                                        authentication:
                                          value as ActionConfiguration["authentication"],
                                      }))(next);
                                }}
                                id={`webhook-auth-${action.key}`}
                                data={[
                                  { value: "none", label: "None" },
                                  { value: "bearer", label: "Bearer" },
                                  { value: "basic", label: "Basic" },
                                ]}
                              />
                            </Stack>
                            {(action.configuration.authentication ??
                              (action.configuration.bearerTokenConfigured
                                ? "bearer"
                                : "none")) === "bearer" ? (
                              <Stack gap={4}>
                                <Label
                                  required={
                                    !action.configuration.bearerTokenConfigured
                                  }
                                  htmlFor={`pipeline-action-${action.key}-token`}
                                >
                                  Bearer token
                                </Label>
                                <Input
                                  autoComplete="new-password"
                                  required={
                                    !action.configuration.bearerTokenConfigured
                                  }
                                  id={`pipeline-action-${action.key}-token`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-token`
                                    ]
                                  }
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      bearerToken: event.target.value,
                                    })
                                  }
                                  type="password"
                                  placeholder={
                                    action.configuration.bearerTokenConfigured
                                      ? "Saved — leave empty to keep"
                                      : ""
                                  }
                                  value={action.configuration.bearerToken ?? ""}
                                />
                              </Stack>
                            ) : null}
                            {action.configuration.authentication === "basic" ? (
                              <>
                                <Stack gap={4}>
                                  <Label
                                    required
                                    htmlFor={`webhook-user-${action.key}`}
                                  >
                                    Username
                                  </Label>
                                  <Input
                                    id={`webhook-user-${action.key}`}
                                    error={
                                      actionFieldErrors[action.key]?.[
                                        `webhook-user-${action.key}`
                                      ]
                                    }
                                    required
                                    value={action.configuration.username ?? ""}
                                    onChange={(event) =>
                                      updateActionConfiguration(index, {
                                        username: event.target.value,
                                      })
                                    }
                                  />
                                </Stack>
                                <Stack gap={4}>
                                  <Label
                                    required={
                                      !action.configuration.passwordConfigured
                                    }
                                    htmlFor={`webhook-password-${action.key}`}
                                  >
                                    Password
                                  </Label>
                                  <Input
                                    id={`webhook-password-${action.key}`}
                                    error={
                                      actionFieldErrors[action.key]?.[
                                        `webhook-password-${action.key}`
                                      ]
                                    }
                                    autoComplete="new-password"
                                    type="password"
                                    required={
                                      !action.configuration.passwordConfigured
                                    }
                                    placeholder={
                                      action.configuration.passwordConfigured
                                        ? "Saved — leave empty to keep"
                                        : ""
                                    }
                                    value={action.configuration.password ?? ""}
                                    onChange={(event) =>
                                      updateActionConfiguration(index, {
                                        password: event.target.value,
                                      })
                                    }
                                  />
                                </Stack>
                              </>
                            ) : null}
                            <details style={{ gridColumn: "1 / -1" }}>
                              <Text
                                component="summary"
                                size="sm"
                                py="xs"
                                style={{ cursor: "pointer" }}
                              >
                                URL templates and responses
                              </Text>
                              <Stack gap="sm">
                                <Text size="sm" c="dimmed">
                                  Use a fixed HTTPS server. Path and query
                                  support <code>{"{{meta.submissionId}}"}</code>
                                  , <code>{"{{meta.sourceId}}"}</code>,{" "}
                                  <code>{"{{meta.runId}}"}</code>,{" "}
                                  <code>{"{{meta.actionRunId}}"}</code> and{" "}
                                  <code>{"{{payload.field}}"}</code>. Values are
                                  URL-encoded; missing or non-scalar values fail
                                  the Action.
                                </Text>
                                <Text size="sm" c="dimmed">
                                  GET and HEAD send no request body; other
                                  methods send the current payload as JSON.
                                  Return 2xx with an empty body or a flat JSON
                                  object, whose fields update the payload. Other
                                  responses, including 409, use the configured
                                  retry policy.
                                </Text>
                              </Stack>
                            </details>
                          </FormFields>
                        ) : null}
                        {action.type === "callback" ? (
                          <FormFields>
                            <Stack gap={4} style={{ gridColumn: "1 / -1" }}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-url`}
                              >
                                Webhook URL
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-url`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-url`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    url: event.target.value,
                                  })
                                }
                                required
                                type="url"
                                value={action.configuration.url ?? ""}
                              />
                              <Text size="sm" c="dimmed">
                                Forman sends the current payload in payload and
                                a one-time callback URL in meta.callbackUrl.
                              </Text>
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                htmlFor={`pipeline-action-${action.key}-timeout`}
                              >
                                Callback timeout (hours)
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-timeout`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-timeout`
                                  ]
                                }
                                max={24}
                                min={1}
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    timeoutSeconds:
                                      Math.max(
                                        1,
                                        Number(event.target.value) || 1,
                                      ) * 3600,
                                  })
                                }
                                type="number"
                                value={Math.round(
                                  (action.configuration.timeoutSeconds ??
                                    86_400) / 3600,
                                )}
                              />
                            </Stack>
                          </FormFields>
                        ) : null}
                        {action.type === "callback_boolean" ? (
                          <FormFields>
                            <Stack gap={4} style={{ gridColumn: "1 / -1" }}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-url`}
                              >
                                Webhook URL
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-url`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-url`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    url: event.target.value,
                                  })
                                }
                                required
                                type="url"
                                value={action.configuration.url ?? ""}
                              />
                              <Text size="sm" c="dimmed">
                                Forman sends the current payload in payload and
                                a one-time callback URL in meta.callbackUrl. A
                                GET or POST to that URL sets this field to true.
                              </Text>
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-field`}
                              >
                                Payload field
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-field`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-field`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    field: event.target.value,
                                  })
                                }
                                required
                                value={action.configuration.field ?? ""}
                              />
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                htmlFor={`pipeline-action-${action.key}-timeout`}
                              >
                                Callback timeout (hours)
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-timeout`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-timeout`
                                  ]
                                }
                                max={24}
                                min={1}
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    timeoutSeconds:
                                      Math.max(
                                        1,
                                        Number(event.target.value) || 1,
                                      ) * 3600,
                                  })
                                }
                                type="number"
                                value={Math.round(
                                  (action.configuration.timeoutSeconds ??
                                    86_400) / 3600,
                                )}
                              />
                            </Stack>
                          </FormFields>
                        ) : null}
                        {action.type === "email" ? (
                          <FormFields>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-recipients`}
                              >
                                Recipients
                              </Label>
                              <Textarea
                                autosize
                                minRows={1}
                                maxRows={14}
                                data-email-recipients
                                id={`pipeline-action-${action.key}-recipients`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-recipients`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    recipients: event.target.value.split("\n"),
                                  })
                                }
                                required
                                value={(
                                  action.configuration.recipients ?? []
                                ).join("\n")}
                              />
                              <Text size="sm" c="dimmed">
                                Enter one recipient per line.
                              </Text>
                            </Stack>
                            <Select
                              label="Content format"
                              allowDeselect={false}
                              data={[
                                { value: "formatted", label: "Formatted" },
                                { value: "json", label: "JSON" },
                              ]}
                              value={
                                action.configuration.contentFormat ?? "json"
                              }
                              onChange={(value) =>
                                updateActionConfiguration(index, {
                                  contentFormat: value as "formatted" | "json",
                                })
                              }
                            />
                            <Box style={{ gridColumn: "1 / -1" }}>
                              <Input
                                label="Subject"
                                id={`pipeline-action-${action.key}-subject`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-subject`
                                  ]
                                }
                                required
                                maxLength={200}
                                value={
                                  action.configuration.subject ??
                                  "Forman pipeline output"
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    subject: event.target.value,
                                  })
                                }
                              />
                            </Box>
                          </FormFields>
                        ) : null}
                        {action.type === "email_confirmation" ? (
                          <Stack gap="md">
                            <FormFields>
                              <Stack gap={4}>
                                <Label
                                  required
                                  htmlFor={`pipeline-action-${action.key}-email-field`}
                                >
                                  Email payload field
                                </Label>
                                <Input
                                  id={`pipeline-action-${action.key}-email-field`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-email-field`
                                    ]
                                  }
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      emailField: event.target.value,
                                    })
                                  }
                                  placeholder="email"
                                  required
                                  value={action.configuration.emailField ?? ""}
                                />
                              </Stack>
                              <Stack gap={4}>
                                <Label
                                  required
                                  htmlFor={`pipeline-action-${action.key}-boolean-field`}
                                >
                                  Boolean payload field
                                </Label>
                                <Input
                                  id={`pipeline-action-${action.key}-boolean-field`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-boolean-field`
                                    ]
                                  }
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      booleanField: event.target.value,
                                    })
                                  }
                                  placeholder="email.verified"
                                  required
                                  value={
                                    action.configuration.booleanField ?? ""
                                  }
                                />
                              </Stack>
                            </FormFields>
                            <Text size="sm" c="dimmed">
                              The confirmation sets the Boolean field to{" "}
                              <code>true</code>. This Action always blocks the
                              Pipeline.
                            </Text>
                            <FormFields>
                              <Stack gap={4}>
                                <Label
                                  required
                                  htmlFor={`pipeline-action-${action.key}-subject`}
                                >
                                  Email subject
                                </Label>
                                <Input
                                  id={`pipeline-action-${action.key}-subject`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-subject`
                                    ]
                                  }
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      subject: event.target.value,
                                    })
                                  }
                                  required
                                  value={action.configuration.subject ?? ""}
                                />
                              </Stack>
                              <Stack gap={4}>
                                <Label
                                  htmlFor={`pipeline-action-${action.key}-timeout-hours`}
                                >
                                  Timeout (hours)
                                </Label>
                                <Input
                                  id={`pipeline-action-${action.key}-timeout-hours`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-timeout-hours`
                                    ]
                                  }
                                  max={168}
                                  min={1}
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      timeoutHours: Math.max(
                                        1,
                                        Math.min(
                                          168,
                                          Number(event.target.value) || 1,
                                        ),
                                      ),
                                    })
                                  }
                                  type="number"
                                  value={
                                    action.configuration.timeoutHours ?? 24
                                  }
                                />
                              </Stack>
                            </FormFields>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-email-text`}
                              >
                                Email text
                              </Label>
                              <Textarea
                                autosize
                                minRows={3}
                                maxRows={14}
                                id={`pipeline-action-${action.key}-email-text`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-email-text`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    emailText: event.target.value,
                                  })
                                }
                                required
                                value={action.configuration.emailText ?? ""}
                              />
                            </Stack>
                            <Stack gap={4}>
                              <Label
                                required
                                htmlFor={`pipeline-action-${action.key}-email-cta`}
                              >
                                Email button label
                              </Label>
                              <Input
                                id={`pipeline-action-${action.key}-email-cta`}
                                error={
                                  actionFieldErrors[action.key]?.[
                                    `pipeline-action-${action.key}-email-cta`
                                  ]
                                }
                                onChange={(event) =>
                                  updateActionConfiguration(index, {
                                    emailCtaLabel: event.target.value,
                                  })
                                }
                                required
                                value={
                                  action.configuration.emailCtaLabel ||
                                  "Open confirmation"
                                }
                              />
                            </Stack>
                            <Stack gap="md">
                              <Text component="h4" fw={600}>
                                Confirmation page
                              </Text>
                              <Stack gap={4}>
                                <Label
                                  required
                                  htmlFor={`pipeline-action-${action.key}-confirmation-text`}
                                >
                                  Confirmation text
                                </Label>
                                <Textarea
                                  autosize
                                  minRows={3}
                                  maxRows={14}
                                  id={`pipeline-action-${action.key}-confirmation-text`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-confirmation-text`
                                    ]
                                  }
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      confirmationText: event.target.value,
                                    })
                                  }
                                  required
                                  value={
                                    action.configuration.confirmationText ?? ""
                                  }
                                />
                              </Stack>
                              <Stack gap={4}>
                                <Label
                                  required
                                  htmlFor={`pipeline-action-${action.key}-confirmation-cta`}
                                >
                                  Confirmation button label
                                </Label>
                                <Input
                                  id={`pipeline-action-${action.key}-confirmation-cta`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-confirmation-cta`
                                    ]
                                  }
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      confirmationCtaLabel: event.target.value,
                                    })
                                  }
                                  required
                                  value={
                                    action.configuration.confirmationCtaLabel ??
                                    ""
                                  }
                                />
                              </Stack>
                              <Stack gap={4}>
                                <Label
                                  required
                                  htmlFor={`pipeline-action-${action.key}-completed-text`}
                                >
                                  Completed page text
                                </Label>
                                <Textarea
                                  autosize
                                  minRows={3}
                                  maxRows={14}
                                  id={`pipeline-action-${action.key}-completed-text`}
                                  error={
                                    actionFieldErrors[action.key]?.[
                                      `pipeline-action-${action.key}-completed-text`
                                    ]
                                  }
                                  onChange={(event) =>
                                    updateActionConfiguration(index, {
                                      completedText: event.target.value,
                                    })
                                  }
                                  required
                                  value={
                                    action.configuration.completedText ?? ""
                                  }
                                />
                              </Stack>
                            </Stack>
                            <Text size="sm" c="dimmed">
                              Use <code>{"{{meta.field}}"}</code> or{" "}
                              <code>{"{{payload.field}}"}</code> to insert data.
                              Missing values render as <code>null</code>;
                              inserted values are disclosed to the recipient.
                            </Text>
                          </Stack>
                        ) : null}
                        </Stack>
                      </FormGroup>
                    ) : null}

                    <FormGroup legend="Execution">
                      <Stack gap="md">
                        {action.type === "webhook" ? (
                          <Checkbox
                            label="Blocking"
                            id={"pipeline-action-" + action.key + "-blocking"}
                            checked={
                              action.blocking ?? defaultBlocking(action.type)
                            }
                            onChange={(event) =>
                              updateAction(index, {
                                blocking: event.currentTarget.checked,
                              })
                            }
                          />
                        ) : null}
                        <ActionConditionEditor
                          besideSelector={
                            <Input
                              label="Maximum attempts"
                              id={"pipeline-action-" + action.key + "-attempts"}
                              error={
                                actionFieldErrors[action.key]?.[
                                  "pipeline-action-" + action.key + "-attempts"
                                ]
                              }
                              max={10}
                              min={1}
                              type="number"
                              value={action.maximumAttempts ?? 3}
                              onChange={(event) =>
                                updateAction(index, {
                                  maximumAttempts: Math.max(
                                    1,
                                    Math.min(
                                      10,
                                      Number(event.target.value) || 1,
                                    ),
                                  ),
                                })
                              }
                            />
                          }
                          description=""
                          embedded
                          onChange={(condition) =>
                            updateAction(index, { condition })
                          }
                          value={action.condition}
                        />

                        {(action.blocking ?? defaultBlocking(action.type)) ||
                        action.condition ? (
                          <FormFields>
                            {(action.blocking ??
                            defaultBlocking(action.type)) ? (
                              <Select
                                label="On final failure"
                                id={
                                  "pipeline-action-" +
                                  action.key +
                                  "-failure-policy"
                                }
                                value={action.failurePolicy ?? "cancel"}
                                onChange={(value) => {
                                  if (value)
                                    updateAction(index, {
                                      failurePolicy: value as
                                        "cancel" | "bypass",
                                    });
                                }}
                                data={[
                                  {
                                    value: "cancel",
                                    label: "Cancel remaining Actions",
                                  },
                                  {
                                    value: "bypass",
                                    label: "Continue with unchanged payload",
                                  },
                                ]}
                              />
                            ) : null}
                            {action.condition ? (
                              <Select
                                label="When conditions do not match"
                                id={
                                  "pipeline-action-" +
                                  action.key +
                                  "-condition-miss"
                                }
                                value={
                                  action.conditionMissBehavior ?? "skip_action"
                                }
                                onChange={(value) => {
                                  if (value)
                                    updateAction(index, {
                                      conditionMissBehavior: value as
                                        "skip_action" | "skip_remaining",
                                    });
                                }}
                                data={[
                                  {
                                    value: "skip_action",
                                    label: "Skip this Action",
                                  },
                                  {
                                    value: "skip_remaining",
                                    label: "Skip remaining Actions",
                                  },
                                ]}
                              />
                            ) : null}
                          </FormFields>
                        ) : null}
                      </Stack>
                    </FormGroup>
                  </Stack>
                </Box>
                {actionErrors[action.key] &&
                !(
                  action.type === "transformation" &&
                  actionErrors[action.key].includes("JSONata")
                ) ? (
                  <Alert
                    color="red"
                    role="alert"
                    icon={<CircleAlert size={18} />}
                  >
                    {actionErrors[action.key]}
                  </Alert>
                ) : null}
                <SaveBar
                  dirty={
                    !action.id ||
                    savedActionSnapshots[action.id] !==
                      JSON.stringify(actionInput(action))
                  }
                  disabled={pending || actionPendingKey !== null}
                  pending={actionPendingKey === action.key}
                  label="Save Action"
                  saveButtonProps={{
                    onClick: () => void saveAction(index),
                    type: "button",
                  }}
                />
              </Stack>
            </EditorSection>
          ))}
        </EditorAccordion>
      </Stack>
      <ConfirmDialog
        opened={Boolean(actionToRemove)}
        title="Remove Action?"
        confirmLabel="Remove Action"
        pendingLabel="Removing…"
        pending={actionPendingKey !== null}
        error={actionToRemove ? actionErrors[actionToRemove.key] : null}
        onCancel={() => setActionToRemove(null)}
        onConfirm={() => {
          if (!actionToRemove) return;
          const index = actions.findIndex((action) =>
            actionToRemove.id
              ? action.id === actionToRemove.id
              : action.key === actionToRemove.key,
          );
          if (index < 0) setActionToRemove(null);
          else void removeAction(index);
        }}
      >
        Remove {actionToRemove?.name || "this unnamed Action"} permanently;
        existing Pipeline Runs keep their history.
      </ConfirmDialog>
    </PageWorkspace>
  );
}
export function EditPipelineScreen({
  freshnessNotice,
  pipeline,
}: {
  freshnessNotice?: ReactNode;
  pipeline: AdminPipelineDetail;
}) {
  return (
    <PipelineEditor
      key={pipeline.id}
      freshnessNotice={freshnessNotice}
      pipeline={pipeline}
    />
  );
}
