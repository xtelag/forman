"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@mantine/core";

type PopupWidget = { destroy: () => void };
type PopupCommand = (
  command: "create",
  config: Record<string, unknown>,
) => Promise<PopupWidget | undefined> | PopupWidget | undefined;
type FormanWindow = Window & { forman?: PopupCommand };
export type PopupPreviewField = {
  label: string;
  name: string;
  required: boolean;
  type: "checkbox" | "email" | "number" | "text" | "textarea";
  value?: string;
};

const widgetScriptSelector = "script[data-forman-popup-preview-widget]";

function loadWidget() {
  if ((window as FormanWindow).forman) return Promise.resolve();

  const existing =
    document.querySelector<HTMLScriptElement>(widgetScriptSelector);
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Popup widget could not be loaded.")),
        { once: true },
      );
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.dataset.formanPopupPreviewWidget = "true";
    script.src = "/public/pop-up-v1.js";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Popup widget could not be loaded.")),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

const defaultFields: PopupPreviewField[] = [
  { label: "Name", name: "name", required: true, type: "text" },
  { label: "Email", name: "email", required: true, type: "email" },
  { label: "Message", name: "message", required: true, type: "textarea" },
];

export function PopupSourcePreviewButton({
  fields,
  sourceId,
  sourceName,
}: {
  fields?: PopupPreviewField[];
  sourceId: string;
  sourceName: string;
}) {
  const [loading, setLoading] = useState(false);
  const popup = useRef<PopupWidget | undefined>(undefined);

  useEffect(() => () => popup.current?.destroy(), []);

  async function preview() {
    setLoading(true);
    try {
      await loadWidget();
      popup.current?.destroy();
      popup.current = await (window as FormanWindow).forman?.("create", {
        autoOpen: true,
        description: "This sends a real Submission to this Source.",
        fields: fields?.length ? fields : defaultFields,
        sourceId,
        submitLabel: "Submit test",
        title: sourceName,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      disabled={loading}
      onClick={() => void preview()}
      type="button"
      variant="default"
    >
      {loading ? "Loading preview…" : "Preview popup"}
    </Button>
  );
}
