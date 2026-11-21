import type { SmtpSender } from "@/server/config/smtp-settings";
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[
        character
      ]!,
  );
}

export async function sendPipelineEmail({
  from,
  payloadJson,
  recipients,
  sendMail,
  subject = "Forman pipeline output",
  contentFormat = "json",
  fieldLabels = {},
}: {
  from: SmtpSender;
  payloadJson: string;
  subject?: string;
  contentFormat?: "formatted" | "json";
  fieldLabels?: Record<string, string>;
  recipients: string[];
  sendMail: (message: {
    from: SmtpSender;
    html: string;
    subject: string;
    text: string;
    to: string[];
  }) => Promise<unknown>;
}) {
  const payload = JSON.parse(payloadJson);
  const prettyJson = JSON.stringify(payload, null, 2);
  const fields = Object.entries(payload).map(([key, value]) => ({
    label: Object.hasOwn(fieldLabels, key) ? fieldLabels[key] : key,
    value: typeof value === "string" ? value : JSON.stringify(value, null, 2),
  }));
  const text = contentFormat === "formatted"
    ? fields.map(field => `${field.label}: ${field.value}`).join("\n\n")
    : prettyJson;
  const html = contentFormat === "formatted"
    ? `<!doctype html><html><body><table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">${fields.map(field => `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${escapeHtml(field.label)}</th><td style="vertical-align:top;padding:12px;border-bottom:1px solid #ddd;white-space: pre-wrap;overflow-wrap:anywhere">${escapeHtml(field.value)}</td></tr>`).join("")}</table></body></html>`
    : `<!doctype html><html><body><pre>${escapeHtml(prettyJson)}</pre></body></html>`;
  const result = await sendMail({
    from,
    html,
    subject,
    text,
    to: recipients,
  });
  if (
    typeof result === "object" &&
    result !== null &&
    "rejected" in result &&
    Array.isArray(result.rejected) &&
    result.rejected.length > 0
  ) {
    throw new Error("SMTP server rejected one or more recipients");
  }
}

export async function sendEmailConfirmation({
  ctaLabel,
  from,
  recipient,
  sendMail,
  subject,
  text,
  url,
}: {
  ctaLabel: string;
  from: SmtpSender;
  recipient: string;
  sendMail: (message: {
    from: SmtpSender;
    html: string;
    subject: string;
    text: string;
    to: string[];
  }) => Promise<unknown>;
  subject: string;
  text: string;
  url: string;
}) {
  const result = await sendMail({
    from,
    html: `<!doctype html><html><body><p>${escapeHtml(text).replace(/\n/g, "<br>")}</p><p><a href="${escapeHtml(url)}">${escapeHtml(ctaLabel)}</a></p></body></html>`,
    subject,
    text: `${text}\n\n${ctaLabel}: ${url}`,
    to: [recipient],
  });
  if (
    typeof result === "object" &&
    result !== null &&
    "rejected" in result &&
    Array.isArray(result.rejected) &&
    result.rejected.length > 0
  ) {
    throw new Error("SMTP server rejected the confirmation recipient");
  }
}
