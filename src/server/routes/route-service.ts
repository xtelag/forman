import { isIP } from "node:net";

import { z } from "zod";

const email = z.string().email();

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export type RouteInput =
  | { name: string; type: "inbox" }
  | { name: string; recipients: string[]; type: "smtp" }
  | {
      bearerToken?: string;
      clearBearerToken: boolean;
      name: string;
      type: "webhook";
      webhookUrl: string;
    };

export function parseRouteInput(value: unknown): RouteInput {
  const input = z
    .object({
      name: z.string().trim().min(1).max(120),
      bearerToken: z.string().trim().min(1).max(4096).optional(),
      clearBearerToken: z.boolean().optional().default(false),
      recipients: z.string().optional(),
      type: z.enum(["smtp", "webhook", "inbox"]),
      webhookUrl: z.string().optional(),
    })
    .parse(value);

  if (input.type === "inbox") return { name: input.name, type: "inbox" };

  if (input.type === "smtp") {
    const recipients = (input.recipients ?? "")
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (recipients.length === 0)
      throw new Error("Enter at least one recipient");
    const invalidRecipient = recipients.find(
      (recipient) => !email.safeParse(recipient).success,
    );
    if (invalidRecipient)
      throw new Error("Enter one valid email address per line");
    return {
      name: input.name,
      recipients: [...new Set(recipients)],
      type: "smtp",
    };
  }

  let url: URL;
  const rawWebhookUrl = input.webhookUrl?.trim() ?? "";
  const webhookUrl = /^[a-z][a-z0-9+.-]*:/i.test(rawWebhookUrl)
    ? rawWebhookUrl
    : `https://${rawWebhookUrl}`;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error("Enter a public HTTPS URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    isPrivateIpv4(url.hostname) ||
    isIP(url.hostname) === 6
  ) {
    throw new Error("Enter a public HTTPS URL");
  }
  if (input.bearerToken && input.clearBearerToken)
    throw new Error("Enter a bearer token or remove the saved token, not both");
  return {
    bearerToken: input.bearerToken,
    clearBearerToken: input.clearBearerToken,
    name: input.name,
    type: "webhook",
    webhookUrl:
      url.pathname === "/" && !url.search && !url.hash
        ? url.origin
        : url.toString(),
  };
}
