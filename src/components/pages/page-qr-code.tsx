"use client";

import { Box, Skeleton } from "@mantine/core";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

const qrOptions = {
  color: { dark: "#7c3aed", light: "#ffffff" },
  margin: 1,
  type: "svg" as const,
  width: 192,
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createPageQrSvg(value: string) {
  return QRCode.toString(value, qrOptions);
}

export async function createPageQrDownloadSvg(value: string, caption: string) {
  const qrSvg = await createPageQrSvg(value);
  const captionHeight = caption ? 32 : 0;
  const height = 216 + captionHeight;
  const captionMarkup = caption
    ? `<text x="108" y="236" fill="#2e1065" font-family="Arial, sans-serif" font-size="14" font-weight="500" text-anchor="middle">${escapeXml(caption)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="216" height="${height}" viewBox="0 0 216 ${height}"><rect width="216" height="${height}" fill="#ffffff"/><g transform="translate(12 12)">${qrSvg}</g>${captionMarkup}</svg>`;
}

export function PageQrCode({ value }: { value: string }) {
  const [result, setResult] = useState<{ svg: string; value: string } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void createPageQrSvg(value)
      .then((svg) => {
        if (active) setResult({ svg, value });
      })
      .catch(() => {
        if (active) setResult({ svg: "", value });
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (result?.value !== value || !result.svg)
    return (
      <Skeleton
        aria-label="Generating form QR code"
        w={192}
        h={192}
        radius="md"
      />
    );
  return (
    <Box
      aria-label="form QR code"
      w={192}
      h={192}
      bg="white"
      style={{
        flexShrink: 0,
        overflow: "hidden",
        borderRadius: "var(--mantine-radius-md)",
      }}
      data-value={value}
      dangerouslySetInnerHTML={{ __html: result.svg }}
      role="img"
    />
  );
}
