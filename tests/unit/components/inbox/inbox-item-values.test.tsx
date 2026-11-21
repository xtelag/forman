import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import userEvent from "@testing-library/user-event";
import { InboxItemValues, ReadableValue } from "@/components/inbox/inbox-item-values";

afterEach(cleanup);

test("preserves field order, nested values, multiline text and escaped markup", () => {
  const longText = "Long answer ".repeat(100) + "\nSecond paragraph";
  const { container } = render(<ReadableValue value={{
    name: "<b>Example</b>", note: longText,
    nested: { enabled: false, count: 0 }, choices: ["A", "B"], empty: null,
  }} />);
  expect(Array.from(container.querySelectorAll("dt")).map(node => node.textContent))
    .toEqual(["Name", "Note", "Nested", "Enabled", "Count", "Choices", "Empty"]);
  expect(screen.getByText("<b>Example</b>")).toBeVisible();
  expect(container.querySelector("b")).toBeNull();
  expect(screen.getByText("Second paragraph", { exact: false }).textContent).toBe(longText);
  expect(screen.getByText("No")).toBeVisible();
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.getByText("A")).toBeVisible();
  expect(screen.getByText("B")).toBeVisible();
  expect(screen.getByText("—")).toBeVisible();
});


test("switches Inbox data between Fields and JSON without mixing in metadata", async () => {
  const user = userEvent.setup();
  render(<InboxItemValues outputJson={JSON.stringify({
    payload: { name: "Alex", rating: 5 }, meta: { clientIp: "127.0.0.1" },
  })} />);
  expect(screen.getByRole("radio", { name: "Fields" })).toBeChecked();
  expect(screen.getByText("Alex")).toBeVisible();
  await user.click(screen.getByRole("radio", { name: "JSON" }));
  const json = screen.getByRole("code");
  expect(json).toHaveTextContent('"name": "Alex"');
  expect(json).toHaveTextContent('"rating": 5');
  expect(json).not.toHaveTextContent("clientIp");
  await user.click(screen.getByRole("radio", { name: "Fields" }));
  expect(screen.queryByRole("code")).not.toBeInTheDocument();
  expect(screen.getByText("Alex")).toBeVisible();
});
