import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CollectionSearch } from "@/components/patterns/collection-search";

afterEach(() => { cleanup(); vi.useRealTimers(); });

test("debounces text and retains newer input when an older request is acknowledged", () => {
  vi.useFakeTimers();
  const onChange = vi.fn();
  const view = render(<CollectionSearch value="" onChange={onChange} />);
  const input = screen.getByRole("textbox", { name: "Search" });
  fireEvent.change(input, {target: {value: "Form"}});
  act(() => vi.advanceTimersByTime(299));
  expect(onChange).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onChange).toHaveBeenLastCalledWith("Form");
  fireEvent.change(input, {target: {value: "Form 4"}});
  view.rerender(<CollectionSearch value="Form" onChange={onChange} />);
  expect(input).toHaveValue("Form 4");
  act(() => vi.advanceTimersByTime(300));
  expect(onChange).toHaveBeenLastCalledWith("Form 4");
});

test("waits for composition and clears immediately without losing input focus", () => {
  vi.useFakeTimers();
  const onChange = vi.fn();
  render(<CollectionSearch value="" onChange={onChange} />);
  const input = screen.getByRole("textbox", {name: "Search"});
  fireEvent.compositionStart(input);
  fireEvent.change(input, {target: {value: "日本"}});
  act(() => vi.advanceTimersByTime(500));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  act(() => vi.advanceTimersByTime(300));
  expect(onChange).toHaveBeenLastCalledWith("日本");
  fireEvent.click(screen.getByRole("button", {name: "Clear search"}));
  expect(onChange).toHaveBeenLastCalledWith("");
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
});
