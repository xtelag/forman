import Link from "next/link";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CollectionEmptyState } from "@/components/patterns/collection-empty-state";

afterEach(cleanup);

test.each([
  [{}, "No Pipeline Runs yet", true],
  [{ sourceId: "source" }, "No Pipeline Runs for this Source", false],
  [{ pipelineId: "pipeline" }, "No Pipeline Runs for this Pipeline", false],
  [{ sourceId: "source", pipelineId: "pipeline" }, "No Pipeline Runs for this Source and Pipeline", false],
  [{ sourceId: "source", filtered: true }, "No Pipeline Runs match these filters", false],
  [{ pipelineId: "pipeline", filtered: true }, "No Pipeline Runs match these filters", false],
])("describes context without implying missing setup: %j", (props, title, showHelp) => {
  render(<CollectionEmptyState records="Pipeline Runs" {...props}>Global explanation</CollectionEmptyState>);
  expect(screen.getByRole("heading", { name: title })).toBeVisible();
  expect(Boolean(screen.queryByText("Global explanation"))).toBe(showHelp);
  expect(Boolean(screen.queryByText("Adjust or clear the filters."))).toBe(Boolean("filtered" in props && props.filtered));
});

test("Trash remains distinct from the active Inbox", () => {
  render(<CollectionEmptyState records="Inbox items in Trash" sourceId="source" title="Trash is empty" />);
  expect(screen.getByRole("heading", { name: "No Inbox items in Trash for this Source" })).toBeVisible();
});

test("supports contextual actions and a separate filtered-result action", () => {
  const view = render(<CollectionEmptyState records="Submissions" sourceId="s"
    action={<Link href="/app/sources/public">Open Source</Link>}
    filteredAction={<button>Clear filters</button>} />);
  expect(screen.getByRole("link", {name:"Open Source"})).toBeVisible();
  view.rerender(<CollectionEmptyState records="Submissions" sourceId="s" filtered
    action={<Link href="/app/sources/public">Open Source</Link>}
    filteredAction={<button>Clear filters</button>} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name:"Clear filters"})).toBeVisible();
});
