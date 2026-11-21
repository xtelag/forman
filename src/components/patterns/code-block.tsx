"use client";

import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  ActionIcon,
  Box,
  Group,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";

type CodeBlockProperties = {
  code: string;
  copyDisabled?: boolean;
  displayCode?: string;
  label: string;
  writeToClipboard?: (value: string) => Promise<void>;
};

function languageFor(label: string) {
  if (label === "HTML") return "html" as const;
  if (label === "JavaScript" || label === "fetch example")
    return "javascript" as const;
  if (label === "JSX") return "jsx" as const;
  if (label === "TSX") return "tsx" as const;
  if (label === "JSON") return "json" as const;
  return "bash" as const;
}

function formatLabel(label: string) {
  if (label === "curl") return "cURL";
  if (label === "fetch example") return "JavaScript";
  if (label === "popup setup") return "HTML";
  if (label === "endpoints" || label === "session API") return "HTTP";
  return label;
}

export function CodeBlock({
  code,
  copyDisabled = false,
  displayCode = code,
  label,
  writeToClipboard = (value) => navigator.clipboard.writeText(value),
}: CodeBlockProperties) {
  const [highlightedCode, setHighlightedCode] = useState<{
    code: string;
    html: string;
  } | null>(null);
  const [status, setStatus] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    let active = true;
    void import("shiki/bundle/web")
      .then(({ codeToHtml }) =>
        codeToHtml(displayCode, {
          lang: displayCode.trimStart().startsWith("<")
            ? "html"
            : languageFor(label),
          themes: {
            light: "github-light-high-contrast",
            dark: "github-dark-high-contrast",
          },
        }),
      )
      .then((html) => {
        if (active)
          setHighlightedCode({
            code: displayCode,
            html: html.replace(/background-color:[^;"]+;?/g, ""),
          });
      })
      .catch(() => {
        if (active) setHighlightedCode(null);
      });
    return () => {
      active = false;
    };
  }, [displayCode, label]);

  useEffect(() => {
    if (status !== "copied") return;
    const timeout = window.setTimeout(() => setStatus(null), 1_500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function copyCode() {
    try {
      await writeToClipboard(code);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <>
      <Box
        miw={0}
        maw="100%"
        bg="var(--mantine-color-default-hover)"
        style={{ overflow: "hidden", borderRadius: "var(--mantine-radius-md)" }}
        data-slot="code-block"
      >
        <Group
          justify="space-between"
          gap="sm"
          px="sm"
          py={6}
          wrap="nowrap"
          data-slot="code-block-toolbar"
        >
          <Text size="xs" fw={500} c="dimmed">
            {formatLabel(label)}
          </Text>
          <Tooltip
            label={status === "copied" ? "Copied" : "Copy code"}
            events={{ hover: true, focus: true, touch: true }}
          >
            <Box
              component="span"
              display="inline-flex"
              tabIndex={copyDisabled ? 0 : undefined}
            >
              <ActionIcon
                aria-label="Copy code"
                color={
                  status === "copied"
                    ? "green"
                    : status === "failed"
                      ? "red"
                      : "gray"
                }
                disabled={copyDisabled}
                onClick={copyCode}
                size="md"
                type="button"
                variant={status ? "light" : "default"}
              >
                {status === "copied" ? (
                  <CheckIcon size={16} />
                ) : status === "failed" ? (
                  <XIcon size={16} />
                ) : (
                  <CopyIcon size={16} />
                )}
              </ActionIcon>
            </Box>
          </Tooltip>
        </Group>
        {status ? (
          <VisuallyHidden role="status">
            {status === "copied"
              ? "Copied " + label + "."
              : "Could not copy " + label + "."}
          </VisuallyHidden>
        ) : null}
        <div
          aria-label={`${label} code`}
          className="max-h-[32rem] min-w-0 overflow-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
          data-slot="code-block-viewport"
          role="region"
          tabIndex={0}
        >
          {highlightedCode?.code === displayCode ? (
            <div
              className="[&_pre]:m-0 [&_pre]:min-w-0 [&_pre]:bg-transparent! [&_pre]:p-4 [&_pre]:text-sm dark:[&_span]:text-(--shiki-dark)! dark:[&_pre]:text-(--shiki-dark)!"
              data-testid="syntax-highlighted-code"
              dangerouslySetInnerHTML={{ __html: highlightedCode.html }}
            />
          ) : (
            <pre className="min-w-0 p-4 text-sm">
              <code>{displayCode}</code>
            </pre>
          )}
        </div>
      </Box>
    </>
  );
}
