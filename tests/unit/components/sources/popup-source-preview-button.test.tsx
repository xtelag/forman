import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PopupSourcePreviewButton } from "@/components/sources/popup-source-preview-button";

describe("PopupSourcePreviewButton", () => {
  afterEach(() => {
    cleanup();
    delete (window as Window & { forman?: unknown }).forman;
  });

  test("uses the form's defined field names in the test submission", async () => {
    const user = userEvent.setup();
    const forman = vi.fn().mockResolvedValue({ destroy: vi.fn() });
    (window as Window & { forman?: typeof forman }).forman = forman;

    render(
      <PopupSourcePreviewButton
        fields={[
          { label: "Email", name: "email", required: true, type: "email" },
          { label: "Name", name: "name", required: true, type: "text" },
          { label: "Note", name: "note", required: true, type: "textarea" },
        ]}
        sourceId="contact"
        sourceName="Contact survey"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Preview popup" }));

    expect(forman).toHaveBeenCalledWith("create", expect.objectContaining({
      title: "Contact survey",
      fields: [
        { label: "Email", name: "email", required: true, type: "email" },
        { label: "Name", name: "name", required: true, type: "text" },
        { label: "Note", name: "note", required: true, type: "textarea" },
      ],
    }));
  });
});
