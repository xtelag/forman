import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const tagApi = vi.hoisted(() => ({
  listTags: vi.fn(),
  saveSourceSettingsSection: vi.fn(),
}));

vi.mock("@/client/admin-api/sources", () => tagApi);

import {
  SourceTagsConfiguration,
  TagBadge,
} from "@/components/sources/source-tags-configuration";

describe("TagBadge", () => {
  afterEach(cleanup);

  test("renders the amber pastel badge color", () => {
    render(
      <TagBadge tag={{ color: "amber", id: "tag-1", name: "Priority" }} />,
    );

    expect(
      screen.getByText("Priority").closest(".mantine-Badge-root"),
    ).toHaveStyle("--badge-bg: var(--mantine-color-yellow-light)");
  });

  test("renders the rose pastel badge color", () => {
    render(<TagBadge tag={{ color: "rose", id: "tag-1", name: "Priority" }} />);

    expect(
      screen.getByText("Priority").closest(".mantine-Badge-root"),
    ).toHaveStyle("--badge-bg: var(--mantine-color-pink-light)");
  });

  test("preserves the tag name and optional keyboard action", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(
      <TagBadge
        tag={{ color: "blue", id: "tag-1", name: "Customer follow-up" }}
        action={
          <button onClick={action} aria-label="Remove Customer follow-up">
            ×
          </button>
        }
      />,
    );
    expect(screen.getByText("Customer follow-up")).toBeInTheDocument();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Remove Customer follow-up" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(action).toHaveBeenCalledOnce();
  });

  test("links to Settings only after confirming the catalog is empty", async () => {
    tagApi.listTags.mockResolvedValue([]);
    render(<SourceTagsConfiguration sourceId="form-1" initialTags={[]} />);

    expect(
      await screen.findByRole("heading", { name: "No tags available" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage tags" })).toHaveAttribute("href", "/app/settings#tags");
    expect(screen.queryByText("Assigned tags")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New tag name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add tag" }),
    ).not.toBeInTheDocument();
  });

  test("does not offer catalog setup while loading", () => {
    tagApi.listTags.mockReturnValue(new Promise(() => {}));
    render(<SourceTagsConfiguration sourceId="form-1" />);
    expect(screen.queryByText("No tags available")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage tags" })).not.toBeInTheDocument();
  });

  test("offers retry rather than setup when the catalog fails to load", async () => {
    tagApi.listTags.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce([]);
    render(<SourceTagsConfiguration sourceId="form-1" />);
    await screen.findByRole("heading", { name: "Tags could not be loaded" });
    expect(screen.queryByRole("link", { name: "Manage tags" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Manage tags" })).toBeVisible();
  });

  test("keeps keyboard focus inside a Source tag badge", async () => {
    tagApi.listTags.mockResolvedValue([
      { color: "blue", id: "sales", name: "Sales" },
    ]);
    render(<SourceTagsConfiguration sourceId="form-1" initialTags={[]} />);

    const trigger = await screen.findByRole("button", { name: "Sales" });
    const user = userEvent.setup();
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("link", { name: "Manage tags" })).not.toBeInTheDocument();
  });

  test("immediately saves an assignment when a neutral tag is clicked", async () => {
    const user = userEvent.setup();
    tagApi.listTags.mockResolvedValue([
      { color: "blue", id: "sales", name: "Sales" },
    ]);
    tagApi.saveSourceSettingsSection.mockResolvedValue({});

    render(<SourceTagsConfiguration sourceId="form-1" initialTags={[]} />);
    await user.click(await screen.findByRole("button", { name: "Sales" }));

    expect(tagApi.saveSourceSettingsSection).toHaveBeenCalledWith(
      "form-1",
      "tags",
      { tagIds: ["sales"] },
    );
    expect(
      screen.queryByRole("button", { name: "Save tags" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sales" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
