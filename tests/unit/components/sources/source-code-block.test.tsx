import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SourceCodeBlock } from "@/components/sources/source-code-block";

vi.mock("shiki/bundle/web", () => ({
  codeToHtml: vi
    .fn()
    .mockResolvedValue(
      '<pre style="background-color:#fff;color:#24292f"><code><span class="token tag">&lt;form&gt;</span></code></pre>',
    ),
}));

describe("SourceCodeBlock", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("copies the complete popup recipe while retaining an accessible announcement", async () => {
    const user = userEvent.setup();
    const writeToClipboard = vi.fn().mockResolvedValue(undefined);
    const popupRecipe =
      '<script src="https://forman.test/public/pop-up-v1.js" defer></script>\n<script>forman("create", { sourceId: "contact-form", fields: [{ name: "email", label: "Email", type: "email" }] })</script>';
    render(
      <SourceCodeBlock
        code={popupRecipe}
        label="Popup form"
        writeToClipboard={writeToClipboard}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(writeToClipboard).toHaveBeenCalledWith(popupRecipe);
    expect(screen.getByRole("button", { name: "Copy code" })).toHaveAttribute(
      "data-variant",
      "light",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Copied Popup form.");
  });

  test("shows a masked display value while copying the executable snippet", async () => {
    const writeToClipboard = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SourceCodeBlock
        code="Bearer $FORMAN_SERVER_TOKEN"
        displayCode="Bearer abc████████"
        label="curl"
        writeToClipboard={writeToClipboard}
      />,
    );

    expect(screen.getByText("Bearer abc████████")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeToClipboard).toHaveBeenCalledWith(
      "Bearer $FORMAN_SERVER_TOKEN",
    );
  });
});
