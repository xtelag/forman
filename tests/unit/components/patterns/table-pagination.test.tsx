import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TablePagination } from "@/components/patterns/table-pagination";

describe("TablePagination", () => {
  afterEach(cleanup);

  test("hides pagination for empty results", () => {
    const { container } = render(<TablePagination onPageChange={vi.fn()} onPageSizeChange={vi.fn()} page={1} pageSize={10} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the single-page range and changes the requested page size", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(<TablePagination onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} page={1} pageSize={10} total={9} />);

    expect(screen.getByText("1–9 of 9")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "50" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  test("shows a later range and delegates first, previous, next, and last navigation", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<TablePagination onPageChange={onPageChange} onPageSizeChange={vi.fn()} page={2} pageSize={10} total={78} />);

    expect(screen.getByText("11–20 of 78")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "First page" }));
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(3, 3);
    expect(onPageChange).toHaveBeenNthCalledWith(4, 8);
  });
});
