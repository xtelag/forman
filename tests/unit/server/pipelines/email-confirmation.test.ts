import { describe, expect, test } from "vitest";

import {
  canonicalEmailRecipient,
  normalizeEmailConfirmationConfiguration,
  renderEmailConfirmationText,
} from "@/server/pipelines/email-confirmation";

describe("Email Confirmation configuration", () => {
  test("uses the approved defaults and forces the configured timeout range", () => {
    expect(
      normalizeEmailConfirmationConfiguration({
        booleanField: "email.verified",
        emailField: "email",
      }),
    ).toMatchObject({
      completedText: "Confirmation has been received. This page can now be closed.",
      confirmationCtaLabel: "Confirm",
      confirmationText: "Confirm continuation.",
      emailCtaLabel: "Open confirmation",
      emailField: "email",
      emailText: "Please use the button below to continue.",
      subject: "Confirmation required",
      timeoutHours: 24,
    });
  });

  test("renders allowed metadata and payload fields as text and missing fields as null", () => {
    expect(
      renderEmailConfirmationText("Hi {{payload.name}} from {{meta.sourceName}}: {{payload.absent}}", {
        meta: { sourceName: "<Source>" },
        payload: { name: "<Ada>" },
      }),
    ).toBe("Hi <Ada> from <Source>: null");
  });

  test("accepts exactly one valid e-mail recipient", () => {
    expect(canonicalEmailRecipient("Ada@example.test")).toBe("ada@example.test");
    expect(canonicalEmailRecipient(["ada@example.test"])).toBeNull();
    expect(canonicalEmailRecipient("not-an-email")).toBeNull();
  });
});
