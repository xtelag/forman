import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { CollectionBulkActions, useCollectionSelection } from "@/components/patterns/collection-bulk-actions";

afterEach(cleanup);
const items = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }];
function Harness({ scope = "first", run = async () => {}, eligible = () => true }: {
  scope?: string; run?: (item: typeof items[number]) => Promise<unknown>;
  eligible?: (item: typeof items[number]) => boolean;
}) {
  const selection = useCollectionSelection({ items, scope, getId: (item) => item.id });
  const [pending, setPending] = useState(false);
  const table = selection.forPage(items, pending);
  return <>
    <output aria-label="Selection state">{String(table.allSelected)}</output>
    <button onClick={() => table.onSelectAll(true)}>Select page</button>
    <button onClick={() => table.onSelectedChange(items[0], true)}>Select Alpha</button>
    <CollectionBulkActions selected={selection.selected} getName={(item) => item.name}
      onClear={selection.clear} onRetain={selection.retain} onChanged={() => {}}
      onPendingChange={setPending}
      actions={[{ id: "delete", label: "Delete selected", description: "Permanent deletion",
        destructive: true, run, eligible, blockedReason: (n) => n + " blocked" }]} />
  </>;
}
test("selects the page, clears selection and resets it when filters change", () => {
  const { rerender } = render(<Harness />);
  fireEvent.click(screen.getByText("Select page"));
  expect(screen.getByText("2 selected")).toBeVisible();
  expect(screen.getByLabelText("Selection state")).toHaveTextContent("true");
  fireEvent.click(screen.getByText("Clear selection"));
  expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Select Alpha"));
  expect(screen.getByText("1 selected")).toBeVisible();
  expect(screen.getByLabelText("Selection state")).toHaveTextContent("indeterminate");
  rerender(<Harness scope="second" />);
  expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
});
test("blocks a batch containing ineligible items instead of silently skipping them", () => {
  render(<Harness eligible={(item) => item.id === "a"} />);
  fireEvent.click(screen.getByText("Select page"));
  expect(screen.getByRole("button", { name: "Delete selected" })).toBeDisabled();
  expect(screen.getByText("1 blocked")).toBeVisible();
});
test("retains only failures, names them, and prevents duplicate confirmation", async () => {
  const run = vi.fn(async (item: typeof items[number]) => {
    if (item.id === "b") throw new Error("Active Runs");
  });
  render(<Harness run={run} />);
  fireEvent.click(screen.getByText("Select page"));
  fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
  const buttons = screen.getAllByRole("button", { name: "Delete selected" });
  fireEvent.click(buttons[buttons.length - 1]);
  fireEvent.click(buttons[buttons.length - 1]);
  await screen.findByText(/1 completed; 1 failed. Beta: Active Runs/);
  expect(run).toHaveBeenCalledTimes(2);
  expect(screen.getByText("1 selected")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry failed" })).toBeEnabled();
});
test("successful batch clears selection", async () => {
  const run = vi.fn(async () => {});
  render(<Harness run={run} />);
  fireEvent.click(screen.getByText("Select page"));
  fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete selected" }).at(-1)!);
  await waitFor(() => expect(screen.queryByText("2 selected")).not.toBeInTheDocument());
  expect(run).toHaveBeenCalledTimes(2);
});

test("preserves page selections and captures all results without later arrivals", () => {
  function Pages({page, catalog}: {page: number; catalog: typeof items}) {
    const selection = useCollectionSelection({items: catalog, scope: "same-filter", getId: item => item.id});
    const controls = selection.forPage(catalog.slice(page, page + 1));
    return <><output>{selection.selected.map(item => item.id).join(",")}</output>
      <button onClick={() => controls.onSelectAll(true)}>Page</button>
      <button onClick={() => selection.selectAll(catalog)}>All</button></>;
  }
  const view = render(<Pages page={0} catalog={items} />);
  fireEvent.click(screen.getByText("Page"));
  view.rerender(<Pages page={1} catalog={items} />);
  expect(screen.getByRole("status")).toHaveTextContent("a");
  fireEvent.click(screen.getByText("Page"));
  expect(screen.getByRole("status")).toHaveTextContent("a,b");
  fireEvent.click(screen.getByText("All"));
  view.rerender(<Pages page={1} catalog={[...items, {id:"c", name:"Later"}]} />);
  expect(screen.getByRole("status")).toHaveTextContent(/^a,b$/);
});

test("limits concurrency to four, reports progress and retries only failures", async () => {
  const pending: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  let fail = true;
  const run = vi.fn(async (item: {id:string}) => {
    active++; peak = Math.max(peak, active);
    await new Promise<void>(resolve => pending.push(resolve));
    active--;
    if (item.id === "2" && fail) throw new Error("Temporary failure");
  });
  const records = Array.from({length:9}, (_,id) => ({id:String(id)}));
  render(<CollectionBulkActions selected={records} getName={r=>r.id} onClear={()=>{}}
    onRetain={()=>{}} onChanged={()=>{}} onPendingChange={()=>{}}
    actions={[{id:"disable",label:"Disable selected",description:"Disable records",run}]} />);
  fireEvent.click(screen.getByRole("button", {name:"Disable selected"}));
  fireEvent.click(screen.getAllByRole("button", {name:"Disable selected"}).at(-1)!);
  await waitFor(() => expect(run).toHaveBeenCalledTimes(4));
  await act(async () => { pending.shift()!(); });
  await waitFor(() => expect(screen.getByText("1 / 9")).toBeVisible());
  while (run.mock.calls.length < 9 || active > 0) {
    await act(async () => { pending.splice(0).forEach(resolve=>resolve()); });
  }
  await screen.findByText(/8 completed; 1 failed/);
  expect(peak).toBe(4);
  fail = false;
  fireEvent.click(screen.getByRole("button", {name:"Retry failed"}));
  await waitFor(() => expect(run).toHaveBeenCalledTimes(10));
  expect(run.mock.calls.at(-1)?.[0].id).toBe("2");
  await act(async () => { pending.splice(0).forEach(resolve=>resolve()); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
