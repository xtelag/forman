import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { TagFilter } from "@/components/tags/tag-filter";

const tags = [
  { color: "violet" as const, id: "support", name: "Support" },
  { color: "blue" as const, id: "sales", name: "Sales" },
];

function TagFilterHarness({
  showClearAction = false,
}: {
  showClearAction?: boolean;
}) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  return (
    <TagFilter
      onSelectedTagIdsChange={setSelectedTagIds}
      selectedTagIds={selectedTagIds}
      showClearAction={showClearAction}
      tags={tags}
    />
  );
}

describe("TagFilter", () => {
  afterEach(cleanup);

  test("supports selecting a tag with the keyboard", async () => {
    const user = userEvent.setup();
    render(<TagFilterHarness />);

    const trigger = screen.getByRole("button", { name: "Sales" });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-pressed", "true");
  });

  test("lets a collection include every item matching any selected tag", async () => {
    const user = userEvent.setup();
    render(<TagFilterHarness />);

    const sales = screen.getByRole("button", { name: "Sales" });
    const support = screen.getByRole("button", { name: "Support" });
    expect(screen.getAllByRole("button").indexOf(sales)).toBeLessThan(
      screen.getAllByRole("button").indexOf(support),
    );

    await user.click(sales);
    await user.click(support);

    expect(sales).toHaveAttribute("aria-pressed", "true");
    expect(support).toHaveAttribute("aria-pressed", "true");
  });

  test("clears all selected tags when the collection clear action is used", async () => {
    const user = userEvent.setup();
    const view = render(<TagFilterHarness showClearAction />);
    const filter = within(view.container);

    const clear = filter.getByRole("button", { name: "Clear tag filters" });
    expect(clear).toBeDisabled();

    const sales = filter.getByRole("button", { name: "Sales" });
    const support = filter.getByRole("button", { name: "Support" });
    await user.click(sales);
    await user.click(support);

    expect(clear).toBeEnabled();
    await user.click(clear);

    expect(sales).toHaveAttribute("aria-pressed", "false");
    expect(support).toHaveAttribute("aria-pressed", "false");
    expect(clear).toBeDisabled();
  });
});
