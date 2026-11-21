import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@mantine/core";

describe("PageHeader", () => {
  test("keeps the title, context, and actions in one stable two-row header", () => {
    render(
      <PageHeader
        actions={<Button>Create Source</Button>}
        description="Collection endpoints"
        title="Sources"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Sources" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Collection endpoints")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Source" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "breadcrumb" }),
    ).not.toBeInTheDocument();
  });

  test("names the browser tab after the loaded resource", () => {
    document.title = "Source · Forman";
    render(<PageHeader documentTitle="Contact · Source" title="Source: Contact" />);
    expect(document.title).toBe("Contact · Source · Forman");
  });

  test("keeps the route title until the resource title is known", () => {
    document.title = "Source · Forman";
    render(<PageHeader title="Source" />);
    expect(document.title).toBe("Source · Forman");
  });
});

test("places status and all detail context together below the title", () => {
  const {container} = render(<PageHeader title="Shared detail" status={<span>Active</span>} metadata="Source · ID: example" description="Additional context" />);
  const heading = screen.getByRole("heading", {name:"Shared detail"});
  const metadata = container.querySelector('[data-slot="page-header-metadata"]')!;
  expect(metadata).toHaveTextContent("Active");
  expect(metadata).toHaveTextContent("Source · ID: example");
  expect(metadata).toHaveTextContent("Additional context");
  expect(heading.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector('[data-slot="page-header-eyebrow"]')).toBeNull();
});
