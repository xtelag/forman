import { describe, expect, test, vi } from "vitest";
import { sendPipelineEmail } from "@/server/pipelines/email-action";

describe("Pipeline email", () => {
  test("preserves existing JSON output and subject", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await sendPipelineEmail({ from: "from@example.test", recipients: ["to@example.test"], payloadJson: '{"name":"Alice"}', sendMail });
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: "Forman pipeline output", text: '{\n  "name": "Alice"\n}' });
  });
  test("formats labelled fields safely without losing arrays, nested values or multiline answers", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const payload = { name: "<script>Alice</script>", note: "one\ntwo", items: ["A", "B"], extra: { enabled: false }, empty: null };
    await sendPipelineEmail({ from: "from@example.test", recipients: ["to@example.test"], payloadJson: JSON.stringify(payload), subject: "Contact enquiry", contentFormat: "formatted", fieldLabels: { name: "Full <name>" }, sendMail });
    const message = sendMail.mock.calls[0][0];
    expect(message.subject).toBe("Contact enquiry");
    expect(message.text).toContain("Full <name>: <script>Alice</script>");
    expect(message.text).toContain("note: one\ntwo");
    expect(message.text).toContain('"enabled": false');
    expect(message.text).toContain('"A"');
    expect(message.text).toContain("empty: null");
    expect(message.html).toContain("Full &lt;name&gt;");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("white-space: pre-wrap");
  });
  test("uses a custom subject with JSON", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await sendPipelineEmail({ from: "from@example.test", recipients: ["to@example.test"], payloadJson: "{}", subject: "My subject", contentFormat: "json", sendMail });
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: "My subject", text: "{}" });
  });
});
