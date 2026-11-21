import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Checkbox, Modal } from "@mantine/core";
import { afterEach, expect, test, vi } from "vitest";
import { HelpLabel } from "@/components/patterns/help-tooltip";

afterEach(cleanup);

test("help opens on focus and Escape dismisses it without closing the enclosing dialog", async () => {
  const escape = vi.fn();
  render(
    <Modal opened onClose={escape} title="Create Source">
      <HelpLabel label="Source type" help="Cannot be changed." />
    </Modal>,
  );
  const trigger = screen.getByRole("button", { name: "About Source type" });
  fireEvent.focus(trigger);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Cannot be changed.",
  );
  fireEvent.keyDown(trigger, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  );
  expect(escape).not.toHaveBeenCalled();
});

test("clicking help neither toggles a containing checkbox nor submits or navigates", async () => {
  const change = vi.fn(),
    submit = vi.fn(),
    navigate = vi.fn();
  render(
    <div onClick={navigate}>
      <form onSubmit={submit}>
        <Checkbox
          label={<HelpLabel label="Alias" help="An alternate endpoint." />}
          onChange={change}
        />
      </form>
    </div>,
  );
  fireEvent.click(screen.getByRole("button", { name: "About Alias" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "An alternate endpoint.",
  );
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(change).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test("tap help can be dismissed outside without relying on focus", async () => {
  render(<HelpLabel label="TTL" help="Counter retention." />);
  fireEvent.click(screen.getByRole("button", { name: "About TTL" }));
  expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  fireEvent.touchStart(document.body);
  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  );
});
