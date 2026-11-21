"use client";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  createTheme,
  Group,
  MantineProvider,
  NativeSelect,
  Paper,
  Progress,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { resolveSystemTexts, formatSystemText } from "@/shared/system-texts";
import { formLayout } from "@/shared/form-layout";
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Script from "next/script";
import type { PublicPageModel } from "@/server/pages/public-page-handler";
import type { PageField } from "@/shared/contracts/page";
import type { SubmissionPayload } from "@/shared/contracts/submission";
import type { PublicSourceSession } from "@/shared/contracts/source-session";
import { defaultPageTheme } from "@/shared/contracts/page";
import {
  pageInitialAnswers,
  pageInputValue,
  pageText,
  validatePageAnswers,
  pageValidationMessage,
  type PageValidationIssue,
} from "@/shared/page-form";
import { altchaScriptUrl } from "@/shared/altcha-script";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  CircleAlert,
  Info,
} from "lucide-react";

type Update = {
  operation: "update";
  operationId: string;
  revision: number;
  currentPage: number;
  final: boolean;
  payload: SubmissionPayload;
};
function createSessionId() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
class PageRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter = 0,
  ) {
    super(String(status));
  }
}

export function SourcePage({ page }: { page: PublicPageModel }) {
  const config = page.presentation ?? {};
  const language = config.language ?? "en";
  const messages = resolveSystemTexts(language, config.systemTexts);
  const theme = { ...defaultPageTheme, ...config.theme };
  const steps = page.sessionsEnabled
    ? formLayout(page.fields, config)
        .steps.filter((step) =>
          page.fields.some((field) => field.page === step.id),
        )
        .map((step) => step.id)
    : [1];
  const [answers, setAnswers] = useState<SubmissionPayload>(() =>
    pageInitialAnswers(page.fields, new URLSearchParams(), page.sourceSchema),
  );
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(steps[0]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [done, setDone] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const [invalid, setInvalid] = useState<PageValidationIssue[]>([]);
  const [retry, setRetry] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [continuation, setContinuation] = useState("");
  const [copyState, setCopyState] = useState<"" | "copied" | "error">("");
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopyState(""), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);
  const [logoFailed, setLogoFailed] = useState(false);
  const sessionId = useRef<string | null>(null);
  const revision = useRef(0);
  const opened = useRef(false);
  const pending = useRef<Update | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const initialRead = useRef<{
    pageId: string;
    key: string;
    promise: Promise<PublicSourceSession>;
  } | null>(null);
  const saving = useRef(false);
  const text = (value: string) => pageText(value, answers, config.fallbacks);
  const index = Math.max(0, steps.indexOf(currentPage));
  const progress = steps.length ? ((index + 1) / steps.length) * 100 : 0;
  const stepTitle = (position: number) =>
    config.steps?.find((step) => step.id === steps[position])?.title?.trim() ||
    formatSystemText(messages.step, {
      current: position + 1,
      total: steps.length,
    });
  const shown = page.sessionsEnabled
    ? page.fields.filter((field) => field.page === currentPage)
    : page.fields;

  async function sessionCall(body: object) {
    const response = await fetch(page.sessionUrl!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, sessionId: sessionId.current }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new PageRequestError(
        response.status,
        response.status === 429
          ? Math.max(1, Number(response.headers?.get("retry-after")) || 10)
          : 0,
      );
    return (await response.json()) as PublicSourceSession;
  }
  function rememberLink() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = new URLSearchParams({ session: sessionId.current! }).toString();
    setContinuation(url.toString());
    window.history.replaceState(null, "", url);
  }
  function finish() {
    setDone(true);
    setDirty(false);
    setNotice("");
    heading.current?.focus();
    if (!page.preview && config.successUrl)
      window.location.assign(config.successUrl);
  }
  function restore(session: PublicSourceSession) {
    opened.current = true;
    setHasSession(true);
    revision.current = session.revision;
    pending.current = null;
    setRetry(false);
    setConflict(false);
    setLoadError(false);
    setReady(true);
    setUnavailable(false);
    setDirty(false);
    setAnswers(session.payload);
    setRawInputs({});
    setCurrentPage(
      steps.includes(session.meta.currentPage)
        ? session.meta.currentPage
        : steps[0],
    );
    if (session.status === "completed") finish();
    else {
      setNotice("");
      rememberLink();
    }
  }
  function protection(values: FormData) {
    const honeypot = Object.fromEntries(
      (page.honeypotEnabled ? page.honeypotFieldNames : []).map((name) => {
        const entries = values.getAll(name);
        if (entries.length !== 1 || entries[0] !== "")
          throw new PageRequestError(403);
        return [name, ""];
      }),
    );
    const altcha = String(values.get("altcha") ?? "");
    if (page.altchaEnabled && !altcha) throw new PageRequestError(403);
    return {
      ...(page.altchaEnabled ? { altcha } : {}),
      ...(page.honeypotEnabled ? { honeypot } : {}),
    };
  }
  function failure(error: unknown) {
    const status = error instanceof PageRequestError ? error.status : 0;
    if (status === 403 && page.altchaEnabled)
      form.current
        ?.querySelector<HTMLElement & { reset?: () => void }>("altcha-widget")
        ?.reset?.();
    setRetryAfter(error instanceof PageRequestError ? error.retryAfter : 0);
    setConflict(status === 409);
    setUnavailable(status === 404 || status === 410 || status === 401);
    setNotice(
      status === 403
        ? messages.verify
        : status === 410
          ? messages.expired
          : status === 404 || status === 401
            ? messages.unavailable
            : status === 409
              ? messages.conflict
              : status === 429
                ? messages.rateLimited
                : status === 422
                  ? messages.invalid
                  : messages.error,
    );
    // An explicit rejection permits editing; an uncertain network outcome must retry the same operation.
    if (status >= 400 && status < 500 && status !== 409 && status !== 429)
      pending.current = null;
    setRetry(
      Boolean(pending.current) &&
        status !== 409 &&
        status !== 404 &&
        status !== 410 &&
        status !== 401,
    );
  }
  function loadingFailure(error: unknown) {
    const status = error instanceof PageRequestError ? error.status : 0;
    setLoadError(true);
    setReady(false);
    setUnavailable([401, 404, 410].includes(status));
    setRetryAfter(error instanceof PageRequestError ? error.retryAfter : 0);
    setNotice(
      status === 410
        ? messages.expired
        : [401, 404].includes(status)
          ? messages.unavailable
          : status === 429
            ? messages.rateLimited
            : messages.loadError,
    );
  }
  useEffect(() => {
    if (!retryAfter) return;
    const timer = setTimeout(
      () => setRetryAfter((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [retryAfter]);
  useEffect(() => {
    if ((!dirty && !(busy && ready)) || page.preview || done) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, ready, done, page.preview]);
  /* Hydrate browser-only invitations. Reuse the request across development effect replay,
     and ignore responses belonging to a cleaned-up effect. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.has("session") && !page.preview) {
      if (!page.sessionsEnabled) {
        loadingFailure(new PageRequestError(404));
        return;
      }
      const savedKey = fragment.get("session")!;
      sessionId.current = savedKey;
      if (!/^[A-Za-z0-9_-]{43,128}$/.test(savedKey)) {
        loadingFailure(new PageRequestError(401));
        return;
      }
      setBusy(true);
      setNotice(messages.loading);
      if (
        !initialRead.current ||
        initialRead.current.pageId !== page.pageId ||
        initialRead.current.key !== savedKey
      ) {
        initialRead.current = {
          pageId: page.pageId,
          key: savedKey,
          promise: sessionCall({ operation: "read" }),
        };
      }
      void initialRead.current.promise
        .then((value) => {
          if (!cancelled) restore(value);
        })
        .catch((error) => {
          if (!cancelled) loadingFailure(error);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    } else {
      setAnswers(
        pageInitialAnswers(
          page.fields,
          new URLSearchParams(window.location.search),
          page.sourceSchema,
        ),
      );
      setReady(true);
    }
    return () => {
      cancelled = true;
    };
    // Page identity is stable; subsequent edits must not reinitialize answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.pageId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function validate(fields: PageField[], final: boolean) {
    const failures = validatePageAnswers(
      fields,
      answers,
      page.sourceSchema,
      final,
    );
    for (const field of fields) {
      if (
        (field.valueType === "number" || field.valueType === "array") &&
        rawInputs[field.name] &&
        pageInputValue(field, rawInputs[field.name]) === undefined
      ) {
        failures.unshift({
          name: field.name,
          key: field.valueType === "array" ? "invalidValue" : "number",
        });
      }
    }
    setInvalid(failures);
    if (!failures.length) return true;
    const field = page.fields.find((field) => field.name === failures[0].name)!;
    if (page.sessionsEnabled) setCurrentPage(field.page);
    setNotice(messages.invalid);
    setTimeout(
      () => document.getElementById(`field-${field.name}`)?.focus(),
      0,
    );
    return false;
  }
  async function save(target: number, final: boolean, check: boolean) {
    if (
      saving.current ||
      busy ||
      unavailable ||
      !ready ||
      conflict ||
      retryAfter
    )
      return;
    // Incomplete JSON cannot be represented by the flat draft contract. Keep it
    // editable locally instead of silently dropping it when navigating Back.
    if (
      !pending.current &&
      !check &&
      shown.some(
        (field) =>
          field.valueType === "array" &&
          rawInputs[field.name] &&
          pageInputValue(field, rawInputs[field.name]) === undefined,
      )
    ) {
      validate(shown, false);
      return;
    }
    if (
      !pending.current &&
      check &&
      !validate(final ? page.fields : shown, final)
    )
      return;
    if (page.preview) {
      setCurrentPage(target);
      if (final) finish();
      else setNotice(messages.preview);
      heading.current?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    setNotice(messages.saving);
    try {
      if (page.sessionsEnabled) {
        if (!sessionId.current) sessionId.current = createSessionId();
        if (!opened.current) {
          const values = new FormData(form.current!);
          const session = await sessionCall({
            operation: "open",
            protection: protection(values),
          });
          opened.current = true;
          setHasSession(true);
          revision.current = session.revision;
          rememberLink();
          if (session.status === "completed") {
            restore(session);
            return;
          }
          // Retain locally entered answers if the first open response was lost and retried.
        }
        pending.current ??= {
          operation: "update",
          operationId: crypto.randomUUID(),
          revision: revision.current,
          currentPage: target,
          final,
          payload: structuredClone(answers),
        };
        const saved = await sessionCall(pending.current);
        restore(saved);
        heading.current?.focus();
      } else {
        const values = new FormData(form.current!);
        const proof = protection(values);
        const body = {
          ...answers,
          ...(proof.altcha ? { altcha: proof.altcha } : {}),
          ...proof.honeypot,
        };
        const response = await fetch(page.submissionUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(body),
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok)
          throw new PageRequestError(
            response.status,
            response.status === 429
              ? Math.max(1, Number(response.headers?.get("retry-after")) || 10)
              : 0,
          );
        finish();
      }
    } catch (error) {
      failure(error);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (busy || retryAfter) return;
    if (ready && !window.confirm(messages.discard)) return;
    const resuming = !ready;
    setBusy(true);
    setNotice(messages.loading);
    try {
      restore(await sessionCall({ operation: "read" }));
      setInvalid([]);
    } catch (error) {
      if (resuming) loadingFailure(error);
      else {
        failure(error);
        setConflict(true);
        if (!(error instanceof PageRequestError) || error.status !== 429)
          setNotice(messages.loadError);
      }
    } finally {
      setBusy(false);
    }
  }
  function change(field: PageField, raw: string) {
    setDirty(true);
    if (!notice || notice === messages.copied) setNotice(messages.unsaved);
    if (field.valueType === "number" || field.valueType === "array")
      setRawInputs((current) => ({ ...current, [field.name]: raw }));
    const value = pageInputValue(field, raw);
    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined || value === "") delete next[field.name];
      else next[field.name] = value;
      return next;
    });
    const next = { ...answers };
    if (value === undefined || value === "") delete next[field.name];
    else next[field.name] = value;
    const issues = validatePageAnswers(
      index === steps.length - 1 ? page.fields : shown,
      next,
      page.sourceSchema,
      index === steps.length - 1,
    );
    if (
      (field.valueType === "number" || field.valueType === "array") &&
      raw &&
      value === undefined
    )
      issues.unshift({
        name: field.name,
        key: field.valueType === "array" ? "invalidValue" : "number",
      });
    setInvalid((current) =>
      issues.filter((issue) =>
        current.some((previous) => previous.name === issue.name),
      ),
    );
  }
  const routineNotice = [
    messages.unsaved,
    messages.saving,
    messages.copied,
    messages.loading,
  ].some((value) => value === notice);
  const muted = `color-mix(in srgb, ${theme.text} 72%, ${theme.surface})`;
  const border = `color-mix(in srgb, ${theme.text} 28%, ${theme.surface})`;
  const accent = `color-mix(in srgb, ${theme.text} 6%, ${theme.surface})`;
  const palette = {
    color: theme.text,
    backgroundColor: theme.background,
    colorScheme: "light",
    "--mantine-color-text": theme.text,
    "--mantine-color-gray-4": border,
    "--mantine-color-body": theme.surface,
    "--mantine-color-dimmed": muted,
    "--mantine-color-default": theme.surface,
    "--mantine-color-default-color": theme.text,
    "--mantine-color-default-border": border,
    "--mantine-color-default-hover": accent,
    "--mantine-color-disabled": accent,
    "--mantine-color-disabled-color": muted,
    "--mantine-color-disabled-border": border,
  } as CSSProperties;
  const inputStyles = {
    label: { overflowWrap: "anywhere" as const },
    description: { overflowWrap: "anywhere" as const },
    error: { overflowWrap: "anywhere" as const },
    input: {
      "--input-bg": theme.surface,
      "--input-color": theme.text,
      "--input-bd-focus": theme.text,
    } as CSSProperties,
  };
  const actionStyles = {
    root: { minHeight: 44, height: "auto", paddingTop: 10, paddingBottom: 10 },
    label: { whiteSpace: "normal" as const, overflowWrap: "anywhere" as const },
  };
  const primary = {
    "--button-bg": theme.button,
    "--button-hover": theme.button,
    "--button-color": theme.buttonText,
  } as CSSProperties;
  const noticeStyles = {
    root: { backgroundColor: accent, color: theme.text },
    message: { color: theme.text, overflowWrap: "anywhere" as const },
  };
  const publicTheme = createTheme({
    primaryColor: "violet",
    defaultRadius: theme.radius,
    fontFamily: "Arial, Helvetica, sans-serif",
    headings: { fontFamily: "Arial, Helvetica, sans-serif", fontWeight: "600" },
    respectReducedMotion: true,
    components: {
      TextInput: { defaultProps: { size: "md", styles: inputStyles } },
      Textarea: { defaultProps: { size: "md", styles: inputStyles } },
      NativeSelect: { defaultProps: { size: "md", styles: inputStyles } },
      Button: { defaultProps: { size: "md", styles: actionStyles } },
    },
  });
  // The configured palette belongs to this form, independently of admin appearance.
  return (
    <MantineProvider
      theme={publicTheme}
      forceColorScheme="light"
      cssVariablesSelector="[data-forman-public]"
    >
      <Box
        component="main"
        lang={language}
        data-forman-public
        mih="100dvh"
        style={palette}
      >
        {page.preview ? (
          <Alert
            color="blue"
            variant="light"
            icon={<Info size={20} aria-hidden="true" />}
            role="status"
            aria-live="polite"
            radius={0}
            px={{ base: "md", sm: "xl" }}
            styles={{
              root: {
                position: "sticky",
                top: 0,
                zIndex: 100,
                backgroundColor: "var(--mantine-color-blue-1)",
              },
              wrapper: { width: "fit-content", maxWidth: "100%", marginInline: "auto", alignItems: "center" },
              body: { flex: "0 1 auto", minWidth: 0 },
              icon: { flexShrink: 0, marginTop: 0 },
            }}
          >
            {done ? messages.previewCompleted : messages.preview}
          </Alert>
        ) : null}
        <Box px={{ base: "md", sm: "xl" }} py={{ base: "lg", sm: 48 }}>
        <Paper
          component="section"
          mx="auto"
          maw={theme.width}
          miw={0}
          withBorder
          shadow="xs"
          p={{ base: 24, sm: 32 }}
          style={{ backgroundColor: theme.surface, borderColor: border }}
        >
          <Stack gap="lg">
            {config.logoUrl && !logoFailed ? (
              <Box
                component="img"
                src={config.logoUrl}
                alt={config.logoAlt ?? page.title}
                referrerPolicy="no-referrer"
                mah={96}
                maw="100%"
                style={{ objectFit: "contain", alignSelf: "flex-start" }}
                onError={() => setLogoFailed(true)}
              />
            ) : null}
            <Group justify="space-between" align="start">
              {" "}
              <Title
                order={1}
                flex="1 1 auto"
                maw="100%"
                miw={0}
                size="h2"
                ref={heading}
                tabIndex={-1}
                style={{ outline: "none", overflowWrap: "anywhere" }}
              >
                {text(page.title)}
              </Title>
            </Group>
              {ready &&
              !loadError &&
              !unavailable &&
              !done &&
              page.description ? (
                <Text
                  size="sm"
                  c="dimmed"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {text(page.description)}
                </Text>
              ) : null}
            {!ready || loadError || unavailable ? (
              <Stack gap="md">
                <Text role="status">{notice || messages.loadingForm}</Text>
                {retryAfter > 0 ? (
                  <Text size="sm" role="status">
                    {formatSystemText(messages.wait, { seconds: retryAfter })}
                  </Text>
                ) : null}
                {loadError && !unavailable ? (
                  <Group>
                    <Button
                      style={primary}
                      type="button"
                      disabled={busy || retryAfter > 0}
                      onClick={() => void reload()}
                    >
                      {messages.retryLoad}
                    </Button>
                  </Group>
                ) : null}
              </Stack>
            ) : done ? (
              <Alert
                icon={<Check size={20} />}
                role="status"
                styles={noticeStyles}
              >
                {text(config.successText ?? messages.success)}
              </Alert>
            ) : (
              <>
                {page.sessionsEnabled ? (
                  <Stack gap="xs">
                    <Group
                      justify="space-between"
                      wrap="nowrap"
                      align="baseline"
                      aria-live="polite"
                    >
                      <Text
                        id="form-step"
                        size="sm"
                        fw={500}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {stepTitle(index)}
                      </Text>
                      <Text
                        size="sm"
                        style={{
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {Math.round(progress)}%
                      </Text>
                    </Group>
                    <Progress
                      size="sm"
                      value={progress}
                      aria-label={stepTitle(index)}
                      color={theme.button}
                      styles={{ root: { backgroundColor: accent } }}
                    />
                  </Stack>
                ) : null}
                {page.sessionsEnabled && steps.length > 1 ? (
                  <Alert
                    role="note"
                    icon={<Info size={18} />}
                    styles={noticeStyles}
                  >
                    {messages.navigationSave.replace(
                      "{submit}",
                      text(messages.submit),
                    )}
                  </Alert>
                ) : null}
                {page.sessionsEnabled && !page.preview && hasSession && continuation ? (
                  <Stack gap="xs" align="flex-start">
              <Button
                variant="subtle"
                color={theme.text}
                size="compact-sm"
                styles={{
                  root: { minHeight: 36, height: "auto" },
                  label: { whiteSpace: "normal", overflowWrap: "anywhere" },
                }}
                rightSection={
                  copyState === "copied" ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )
                }
                disabled={busy || !ready || loadError || unavailable}
                onClick={() =>
                  void Promise.resolve()
                    .then(() =>
                      navigator.clipboard.writeText(
                        continuation,
                      ),
                    )
                    .then(() => setCopyState("copied"))
                    .catch(() => setCopyState("error"))
                }
              >
                {text(messages.copy)}
              </Button>
              <VisuallyHidden role="status">
                {copyState === "copied"
                  ? messages.copied
                  : copyState === "error"
                    ? messages.copyError
                    : ""}
              </VisuallyHidden>
                    {copyState === "error" ? (
                      <Text size="sm">{messages.copyError}</Text>
                    ) : null}
                  </Stack>
                ) : null}
                {notice && !routineNotice && notice !== messages.preview ? (
                  <Alert
                    role="alert"
                    icon={<CircleAlert size={18} />}
                    styles={noticeStyles}
                  >
                    {notice}
                  </Alert>
                ) : null}
                {retryAfter > 0 ? (
                  <Text size="sm" role="status">
                    {formatSystemText(messages.wait, { seconds: retryAfter })}
                  </Text>
                ) : null}
                <form
                  ref={form}
                  aria-label={page.title}
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(
                      steps[index + 1] ?? currentPage,
                      index === steps.length - 1,
                      true,
                    );
                  }}
                >
                  <Stack gap="lg">
                    <Box
                      component="fieldset"
                      disabled={
                        busy ||
                        retryAfter > 0 ||
                        !ready ||
                        retry ||
                        conflict ||
                        unavailable
                      }
                      miw={0}
                      m={0}
                      p={0}
                      style={{ border: 0 }}
                    >
                      <Stack gap="lg">
                        {shown.map((field) => {
                          const id = `field-${field.name}`;
                          const issue = invalid.find(
                            (issue) => issue.name === field.name,
                          );
                          const error = issue
                            ? pageValidationMessage(
                                issue,
                                language,
                                config.systemTexts,
                              )
                            : undefined;
                          const label = (
                            <>
                              {text(field.label)}
                              {!field.required ? (
                                <span>{` (${messages.optional})`}</span>
                              ) : null}
                            </>
                          );
                          const description =
                            text(field.helpText ?? field.description ?? "") ||
                            undefined;
                          const common = {
                            id,
                            name: field.name,
                            label,
                            description,
                            error,
                            "aria-required": field.required,
                            "aria-invalid": Boolean(error),
                            withAsterisk: false,
                          };
                          const value = answers[field.name];
                          const inputValue =
                            rawInputs[field.name] ??
                            (Array.isArray(value)
                              ? JSON.stringify(value)
                              : String(value ?? ""));
                          if (field.htmlControl === "checkbox")
                            return (
                              <Checkbox
                                key={field.name}
                                {...common}
                                size="md"
                                color={theme.button}
                                iconColor={theme.buttonText}
                                checked={value === true}
                                onChange={(event) =>
                                  change(
                                    field,
                                    String(event.currentTarget.checked),
                                  )
                                }
                              />
                            );
                          if (field.htmlControl === "textarea")
                            return (
                              <Textarea
                                key={field.name}
                                {...common}
                                value={inputValue}
                                rows={4}
                                resize="vertical"
                                placeholder={text(field.placeholder ?? "")}
                                onChange={(event) =>
                                  change(field, event.currentTarget.value)
                                }
                              />
                            );
                          if (field.htmlControl === "select")
                            return (
                              <NativeSelect
                                key={field.name}
                                {...common}
                                value={String(value ?? "")}
                                onChange={(event) =>
                                  change(field, event.currentTarget.value)
                                }
                              >
                                <option value="">—</option>
                                {field.options?.map((option) => (
                                  <option
                                    key={String(option.value)}
                                    value={String(option.value)}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </NativeSelect>
                            );
                          return (
                            <TextInput
                              key={field.name}
                              {...common}
                              type={field.htmlControl}
                              step={
                                field.htmlControl === "number"
                                  ? "any"
                                  : undefined
                              }
                              value={inputValue}
                              placeholder={text(field.placeholder ?? "")}
                              onChange={(event) =>
                                change(field, event.currentTarget.value)
                              }
                            />
                          );
                        })}
                      </Stack>
                    </Box>
                    {page.honeypotEnabled
                      ? page.honeypotFieldNames.map((name, index) => (
                          <VisuallyHidden key={name} aria-hidden="true">
                            <label htmlFor={`forman-honeypot-${index}`}>
                              Leave this field empty
                            </label>
                            <input
                              id={`forman-honeypot-${index}`}
                              name={name}
                              autoComplete="off"
                              tabIndex={-1}
                            />
                          </VisuallyHidden>
                        ))
                      : null}
                    {page.altchaEnabled && !page.preview && !hasSession
                      ? createElement("altcha-widget", {
                          onstatechange: (event: CustomEvent<{ state: string }>) => {
                            if (event.detail.state === "verified")
                              setNotice((current) => current === messages.verify ? "" : current);
                          },
                          challengeurl: page.challengeUrl,
                          name: "altcha",
                          language,
                        })
                      : null}
                    <Stack gap="xs">
                      {!unavailable ? (
                        <Group justify="space-between" gap="sm">
                          {conflict ? (
                            <Button
                              style={primary}
                              type="button"
                              disabled={busy || retryAfter > 0}
                              onClick={() => void reload()}
                            >
                              {messages.reload}
                            </Button>
                          ) : retry ? (
                            <>
                              <Button
                                style={primary}
                                disabled={busy || retryAfter > 0}
                                type="button"
                                onClick={() =>
                                  void save(currentPage, false, false)
                                }
                              >
                                {messages.retry}
                              </Button>
                              <Button
                                variant="default"
                                type="button"
                                disabled={busy || retryAfter > 0}
                                onClick={() => void reload()}
                              >
                                {messages.reload}
                              </Button>
                            </>
                          ) : (
                            <>
                              {page.sessionsEnabled && index > 0 ? (
                                <Button
                                  variant="default"
                                  disabled={busy || retryAfter > 0 || !ready}
                                  type="button"
                                  leftSection={
                                    <ArrowLeft size={18} aria-hidden="true" />
                                  }
                                  onClick={() =>
                                    void save(steps[index - 1], false, false)
                                  }
                                >
                                  {text(messages.back)}
                                </Button>
                              ) : null}
                              <Button
                                ml="auto"
                                loading={busy}
                                style={primary}
                                disabled={busy || retryAfter > 0 || !ready}
                                type="submit"
                                rightSection={
                                  index === steps.length - 1 ? undefined : (
                                    <ArrowRight size={18} aria-hidden="true" />
                                  )
                                }
                              >
                                {busy
                                  ? text(messages.saving)
                                  : index === steps.length - 1
                                    ? text(messages.submit)
                                    : text(messages.next)}
                              </Button>
                            </>
                          )}
                        </Group>
                      ) : null}
                      <VisuallyHidden role="status" aria-live="polite">
                        {routineNotice ? notice : ""}
                      </VisuallyHidden>
                      {routineNotice && notice && !busy ? (
                        <Text size="sm" c="dimmed">{notice}</Text>
                      ) : null}
                    </Stack>
                  </Stack>
                </form>
              </>
            )}
          </Stack>
          {page.altchaEnabled && !page.preview ? (
            <Script
              src={altchaScriptUrl(page.challengeUrl)}
              strategy="afterInteractive"
              type="module"
            />
          ) : null}
        </Paper>
        </Box>
      </Box>
    </MantineProvider>
  );
}
