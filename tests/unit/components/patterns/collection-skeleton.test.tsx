import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CollectionSkeleton } from "@/components/patterns/collection-skeleton";

describe("CollectionSkeleton", () => {
  test("keeps filter and table geometry visible while a collection loads", () => {
    render(<CollectionSkeleton label="Loading Sources" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading Sources");
    expect(
      document.querySelector('[data-slot="collection-loading-skeleton"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll(".mantine-Skeleton-root").length,
    ).toBeGreaterThan(6);
  });
});
