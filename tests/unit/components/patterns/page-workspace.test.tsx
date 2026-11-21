import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ResourceSection } from "@/components/patterns/resource-section";
import { PageWorkspace } from "@/components/patterns/page-workspace";
import { StatusBadge } from "@/components/patterns/status-badge";

describe("shared workspace patterns", () => {
  test("keeps collection workspace width consistent in every state", () => {
    const view = render(
      <PageWorkspace width="collection">Loading Sources</PageWorkspace>,
    );
    const workspace = view.container.querySelector(
      '[data-slot="page-workspace"]',
    )!;
    const initialWidth = (workspace as HTMLElement).style.maxWidth;
    view.rerender(
      <PageWorkspace width="collection">Loaded Sources</PageWorkspace>,
    );
    expect((workspace as HTMLElement).style.maxWidth).toBe(initialWidth);
    expect(workspace).toHaveTextContent("Loaded Sources");
  });

  test("groups resource content under a described section", () => {
    render(
      <ResourceSection
        actions={<button type="button">Edit</button>}
        description="Current form protections"
        title="Configuration"
      >
        <p>Allowed origins</p>
      </ResourceSection>,
    );

    expect(
      screen.getByRole("heading", { name: "Configuration" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Current form protections")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByText("Allowed origins")).toBeInTheDocument();
  });

  test.each(["active", "inactive", "success", "warning", "error"] as const)(
    "uses the %s semantic status variant",
    (status) => {
      render(<StatusBadge status={status}>{status}</StatusBadge>);

      expect(screen.getByText(status).closest("[data-status]")).toHaveAttribute(
        "data-status",
        status,
      );
    },
  );
});
