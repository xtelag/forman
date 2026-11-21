import { describe, expect, test } from "vitest";

import { parseRouteInput } from "@/server/routes/route-service";

describe("route input", () => {
  test("normalizes SMTP recipients and rejects unsafe webhook endpoints", () => {
    expect(
      parseRouteInput({
        name: "Sales",
        type: "smtp",
        recipients: " sales@example.test\nteam@example.test ",
      }),
    ).toEqual({
      name: "Sales",
      recipients: ["sales@example.test", "team@example.test"],
      type: "smtp",
    });
    expect(() =>
      parseRouteInput({
        name: "Internal",
        type: "webhook",
        webhookUrl: "http://localhost/hook",
      }),
    ).toThrow("public HTTPS URL");
  });

  test("defaults a webhook domain without a scheme to HTTPS", () => {
    expect(
      parseRouteInput({
        name: "Ntfy",
        type: "webhook",
        webhookUrl: "ntfy.sh",
      }),
    ).toMatchObject({
      type: "webhook",
      webhookUrl: "https://ntfy.sh",
    });
    expect(
      parseRouteInput({
        name: "Ntfy topic",
        type: "webhook",
        webhookUrl: "ntfy.sh/mona-16e46b8",
      }),
    ).toMatchObject({
      type: "webhook",
      webhookUrl: "https://ntfy.sh/mona-16e46b8",
    });
    expect(() =>
      parseRouteInput({
        name: "Insecure",
        type: "webhook",
        webhookUrl: "http://ntfy.sh/mona-16e46b8",
      }),
    ).toThrow("public HTTPS URL");
  });
});
