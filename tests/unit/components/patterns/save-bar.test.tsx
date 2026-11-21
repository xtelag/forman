import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { SaveBar } from "@/components/patterns/save-bar";

describe("SaveBar", () => {
  afterEach(cleanup);

  test("enables saving only for unsaved changes", () => {
    const { rerender } = render(<SaveBar dirty={false} />);
    expect(screen.queryByText("No unsaved changes")).not.toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    rerender(<SaveBar dirty />);
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  test("keeps saving blocked while pending or invalid", () => {
    const { rerender } = render(<SaveBar dirty disabled label="Save Action" />);
    expect(screen.getByRole("button", { name: "Save Action" })).toBeDisabled();

    rerender(<SaveBar dirty pending label="Save Action" />);
    expect(screen.getByRole("button", { name: /Saving…/ })).toBeDisabled();
  });
});
