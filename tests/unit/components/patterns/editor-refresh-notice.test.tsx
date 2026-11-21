import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorRefreshNotice } from "@/components/patterns/editor-refresh-notice";

describe("EditorRefreshNotice", () => {
  it("stays absent until newer data conflicts with a local draft", () => {
    render(<EditorRefreshNotice changed={false} onReload={vi.fn()} />);

    expect(screen.queryByText("Newer data is available.")).not.toBeInTheDocument();
  });

  it("offers an explicit local reload for a newer server baseline", () => {
    render(<EditorRefreshNotice changed onReload={vi.fn()} />);

    expect(screen.getByText("Newer data is available.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload and discard changes" })).toBeVisible();
  });
});
