import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@teispace/next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
import { EmailConfirmationPage } from "@/components/public/email-confirmation-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("confirmation requires an explicit click and remains disabled until completion", async () => {
  let resolve!: (value: Response) => void;
  const request = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", request);
  render(
    <EmailConfirmationPage
      capability="test-capability"
      confirmationCtaLabel="Confirm my email"
      confirmationText="Please confirm your address."
    />,
  );
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm my email" }));
  expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "/confirmations/test-capability/confirm",
    { method: "POST" },
  );
  await act(async () =>
    resolve(
      new Response(JSON.stringify({ completedText: "Thank you." }), {
        status: 200,
      }),
    ),
  );
  expect(
    screen.getByRole("heading", { name: "Confirmation received" }),
  ).toBeVisible();
  expect(screen.getByText("Thank you.")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("invalid confirmation never offers a submit action", () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  render(
    <EmailConfirmationPage
      capability="invalid"
      confirmationCtaLabel="Confirm"
      confirmationText="Confirm."
      invalid
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Confirmation unavailable" }),
  ).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
