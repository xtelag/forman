import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { createRef } from "react";
import { FormGroup } from "@/components/patterns/form-layout";
import { AdminNotice } from "@/components/patterns/admin-notice";

afterEach(cleanup);

test("named groups retain native disabling without disabling their siblings", () => {
  render(<><FormGroup legend="Limits" disabled><input aria-label="Limit" /><button>Save limits</button></FormGroup><input aria-label="Name" /></>);
  expect(screen.getByRole("group", { name: "Limits" })).toBeInTheDocument();
  expect(screen.getByLabelText("Limit")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save limits" })).toBeDisabled();
  expect(screen.getByLabelText("Name")).toBeEnabled();
});

test("error notices retain a focusable ref and alert semantics", () => {
  const ref = createRef<HTMLDivElement>();
  render(<AdminNotice color="red" ref={ref} tabIndex={-1}>Save failed</AdminNotice>);
  const notice = screen.getByRole("alert");
  expect(ref.current).toBe(notice);
  ref.current?.focus();
  expect(notice).toHaveFocus();
  expect(notice).toHaveAttribute("data-variant", "error");
});

test("warnings and successful results keep their meaning without being classified as errors", () => {
  render(<><AdminNotice color="yellow" role="alert">Unsaved server changes</AdminNotice><AdminNotice color="green">Test completed</AdminNotice></>);
  expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "warning");
  expect(screen.getByRole("status")).toHaveAttribute("data-variant", "success");
});
