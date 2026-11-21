import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { LocalDateTime } from "@/components/patterns/local-date-time";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test("server output is timezone-independent and browser display retains exact UTC", () => {
  const value = "2026-09-16T14:16:27.123Z";
  expect(renderToString(<LocalDateTime value={value} />)).toContain(">—</time>");
  render(<LocalDateTime value={value} />);
  const time = screen.getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(time.getAttribute("datetime")).toBe(value);
  expect(time.getAttribute("title")).toBe("2026-09-16 14:16:27.123 UTC");
});
