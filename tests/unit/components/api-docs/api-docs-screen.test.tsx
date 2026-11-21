import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ApiDocsScreen } from "@/components/api-docs/api-docs-screen";

test("shows the deferred documentation notice instead of outdated examples", () => {
  const { container } = render(<ApiDocsScreen />);
  expect(screen.getByRole("heading", { name: "API docs" })).toBeInTheDocument();
  expect(screen.getByText("Documentation will be added later.")).toBeVisible();
  expect(container.querySelector("pre")).toBeNull();
});
