import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ServerTokenPanel } from "@/components/sources/server-token-panel";

describe("ServerTokenPanel", () => {
  afterEach(cleanup);

  test("reveals the stored token only after an explicit request and copies it", async () => {
    const user = userEvent.setup();
    const getToken = vi
      .fn()
      .mockResolvedValue({ prefix: "abc", token: "abc-full-token" });
    const onTokenChange = vi.fn();
    const writeToClipboard = vi.fn().mockResolvedValue(undefined);
    render(
      <ServerTokenPanel
        sourceId="contact-form"
        getToken={getToken}
        onTokenChange={onTokenChange}
        prefix="abc"
        writeToClipboard={writeToClipboard}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Machine-to-machine token" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show token" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate token" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("abc…")).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("abc-full-token"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show token" }));

    expect(getToken).toHaveBeenCalledWith("contact-form");
    expect(
      await screen.findByDisplayValue("abc-full-token"),
    ).toBeInTheDocument();
    expect(onTokenChange).toHaveBeenLastCalledWith("abc-full-token");
    await user.click(screen.getByRole("button", { name: "Copy token" }));
    expect(writeToClipboard).toHaveBeenCalledWith("abc-full-token");
    expect(screen.getByRole("status")).toHaveTextContent("Copied token.");
    await user.click(screen.getByRole("button", { name: "Hide token" }));
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
  });

  test("requires confirmation before regenerating the token", async () => {
    const user = userEvent.setup();
    const regenerateToken = vi
      .fn()
      .mockResolvedValue({ prefix: "def", token: "def-full-token" });
    render(
      <ServerTokenPanel
        sourceId="contact-form"
        getToken={async () => ({ prefix: "abc", token: "abc-full-token" })}
        prefix="abc"
        regenerateToken={regenerateToken}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show token" }));
    await user.click(
      await screen.findByRole("button", { name: "Regenerate token" }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Revokes the current token immediately",
    );
    expect(regenerateToken).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Regenerate token" }),
    );

    expect(regenerateToken).toHaveBeenCalledWith("contact-form");
    expect(
      await screen.findByDisplayValue("def-full-token"),
    ).toBeInTheDocument();
  });

  test("shows regeneration failure inside the dialog and preserves the current token", async () => {
    const user = userEvent.setup();
    render(
      <ServerTokenPanel
        sourceId="contact-form"
        prefix="abc"
        regenerateToken={vi.fn().mockRejectedValue(new Error("failed"))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Regenerate token" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Regenerate token" }),
    );
    const heading = screen.getByText("Regenerate machine-to-machine token?");
    const dialog = heading.closest(
      '[role="dialog"], [role="alertdialog"]',
    ) as HTMLElement;
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The token could not be regenerated",
    );
    expect(screen.getByDisplayValue("abc…")).toBeInTheDocument();
  });
});
