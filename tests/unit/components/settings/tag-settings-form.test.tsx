import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const tagApi = vi.hoisted(() => ({
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  getTagUsage: vi.fn(),
  listTags: vi.fn(),
}));

vi.mock("@/client/admin-api/sources", () => tagApi);

import { TagSettingsForm } from "@/components/settings/tag-settings-form";

describe("TagSettingsForm", () => {
  afterEach(cleanup);

  test("prevents a regression that loses the selected color when creating a tag", async () => {
    const user = userEvent.setup();
    tagApi.listTags.mockResolvedValue([]);
    tagApi.createTag.mockResolvedValue({
      color: "blue",
      id: "quality",
      name: "Quality",
    });
    render(<TagSettingsForm />);

    await user.type(screen.getByLabelText("Name"), "Quality");
    await user.click(screen.getByRole("combobox", { name: "Color" }));
    await user.click(await screen.findByRole("option", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: "Add tag" }));

    expect(tagApi.createTag).toHaveBeenCalledWith({
      color: "blue",
      name: "Quality",
    });
    expect(await screen.findByTestId("tag-chip-quality")).toHaveTextContent(
      "Quality",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  test("offers the selected color and all supported choices by name", async () => {
    const user = userEvent.setup();
    tagApi.listTags.mockResolvedValue([]);
    render(<TagSettingsForm />);
    const select = screen.getByRole("combobox", { name: "Color" });
    expect(select).toHaveValue("Violet");
    await user.click(select);
    expect(await screen.findByRole("option", { name: "Violet" })).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(13);
    await user.click(screen.getByRole("option", { name: "Teal" }));
    expect(select).toHaveValue("Teal");
  });
  test("keeps each catalog tag and its delete action together", async () => {
    tagApi.listTags.mockResolvedValue([
      { color: "teal", id: "telecom", name: "Telecommunications" },
    ]);
    render(<TagSettingsForm />);
    const chip = await screen.findByTestId("tag-chip-telecom");
    expect(chip).toHaveTextContent("Telecommunications");
    expect(
      within(chip).getByRole("button", {
        name: "Delete tag Telecommunications",
      }),
    ).toBeEnabled();
  });
  test("prevents a regression that closes deletion without removing the tag", async () => {
    const user = userEvent.setup();
    tagApi.listTags.mockResolvedValue([
      { color: "blue", id: "sales", name: "Sales" },
    ]);
    tagApi.getTagUsage.mockResolvedValue({
      assignedSourceCount: 2,
      assignedSourceNames: ["Contact", "Sales inquiry"],
    });
    tagApi.deleteTag.mockResolvedValue(undefined);

    render(<TagSettingsForm />);
    await user.click(
      await screen.findByRole("button", { name: "Delete tag Sales" }),
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "This removes the tag from 2 Sources (Contact, Sales inquiry).",
    );
    await user.click(screen.getByRole("button", { name: "Delete tag" }));

    expect(tagApi.deleteTag).toHaveBeenCalledWith("sales");
    expect(screen.queryByTestId("tag-chip-sales")).not.toBeInTheDocument();
  });
});
