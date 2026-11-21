import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { EditorTabs, EditorTabPanel } from "@/components/patterns/editor-tabs";

const sections = [
  { value: "main", label: "Configuration" },
  { value: "source fields", label: "Source fields" },
];
function Example({ error = false }: { error?: boolean }) {
  const [value, setValue] = useState("main");
  return (
    <EditorTabs
      value={value}
      onChange={setValue}
      sections={sections}
      label="Editor sections"
    >
      <EditorTabPanel value="main" title="Configuration" forceMount>
        <input aria-label="Name" defaultValue="Original" />
        {error ? <div role="alert">Save failed</div> : null}
      </EditorTabPanel>
      <EditorTabPanel value="source fields" title="Source fields" forceMount>
        <input id="definition" aria-label="Definition" />
      </EditorTabPanel>
    </EditorTabs>
  );
}
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", location.pathname);
});
test("switches one panel at a time and retains drafts", async () => {
  const user = userEvent.setup();
  render(<Example />);
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Configuration");
  expect(screen.queryByRole("heading", { name: "Configuration" })).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Draft");
  await user.click(screen.getByRole("tab", { name: "Source fields" }));
  expect(screen.getByLabelText("Name")).not.toBeVisible();
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Source fields");
  await user.click(screen.getByRole("tab", { name: "Configuration" }));
  expect(screen.getByLabelText("Name")).toHaveValue("Draft");
});
test("reveals old section hashes and field links", async () => {
  window.history.replaceState(null, "", "#source-fields");
  render(<Example />);
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Source fields" })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
  await userEvent.click(screen.getByRole("tab", { name: "Configuration" }));
  act(() => {
    window.location.hash = "definition";
    window.dispatchEvent(new Event("hashchange"));
  });
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Source fields" })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
});
test("reveals late server errors without losing the draft", async () => {
  const user = userEvent.setup();
  const view = render(<Example />);
  await user.type(screen.getByLabelText("Name"), " draft");
  await user.click(screen.getByRole("tab", { name: "Source fields" }));
  view.rerender(<Example error />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(screen.getByLabelText("Name")).toHaveValue("Original draft");
});
test("reveals and focuses an invalid field in the other tab of a shared form", async () => {
  const save = vi.fn();
  function Shared() {
    const [value, setValue] = useState("main");
    return (
      <EditorTabs
        value={value}
        onChange={setValue}
        sections={sections}
        label="Editor sections"
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <EditorTabPanel value="main" title="Configuration" forceMount>
            <input
              aria-label="Invalid name"
              aria-invalid="true"
              ref={(element) => element?.setCustomValidity("Invalid JSON")}
            />
            <button type="submit">Save</button>
          </EditorTabPanel>
          <EditorTabPanel
            value="source fields"
            title="Source fields"
            forceMount
          >
            <button type="submit">Save both</button>
          </EditorTabPanel>
        </form>
      </EditorTabs>
    );
  }
  render(<Shared />);
  await userEvent.click(screen.getByRole("tab", { name: "Source fields" }));
  await userEvent.click(screen.getByRole("button", { name: "Save both" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Invalid name")).toHaveFocus(),
  );
  expect(save).not.toHaveBeenCalled();
});
test("supports arrow-key tab navigation", async () => {
  render(<Example />);
  screen.getByRole("tab", { name: "Configuration" }).focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Source fields" })).toHaveFocus(),
  );
});

test("allows retry after a server field error without treating aria-invalid as native invalidity", async () => {
  const save = vi.fn();
  function Retry() {
    const [value, setValue] = useState("main");
    return (
      <EditorTabs
        value={value}
        onChange={setValue}
        sections={sections}
        label="Editor sections"
      >
        <EditorTabPanel value="main" title="Configuration">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <input
              aria-label="Server-rejected name"
              aria-invalid="true"
              defaultValue="Taken"
            />
            <button type="submit">Retry</button>
          </form>
        </EditorTabPanel>
      </EditorTabs>
    );
  }
  render(<Retry />);
  await userEvent.clear(screen.getByLabelText("Server-rejected name"));
  await userEvent.type(
    screen.getByLabelText("Server-rejected name"),
    "Available",
  );
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(save).toHaveBeenCalledOnce();
});

test("does not suppress native validation feedback for visible fields", () => {
  render(<Example />);
  expect(fireEvent.invalid(screen.getByLabelText("Name"))).toBe(true);
});
test("keeps the selected section in the URL so a reload returns to it", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole("tab", { name: "Source fields" }));
  expect(window.location.hash).toBe("#source-fields");
  cleanup();
  render(<Example />);
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Source fields" })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
});
