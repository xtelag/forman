import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CreateExampleDialog } from "@/components/dashboard/create-example-dialog";
import type { ExampleResponse } from "@/shared/contracts/examples";
afterEach(cleanup);
const result: ExampleResponse = {
  kind: "form",
  name: "Example Form 1",
  sourceId: "source",
  pageId: "public-page",
  submissionId: "submission",
  runId: "run",
  sampleStatus: "completed",
};

test("explains creation and opens the actual form and scoped Inbox", async () => {
  const create = vi.fn().mockResolvedValue(result);
  render(<CreateExampleDialog create={create} onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create example" }));
  expect(screen.getByText(/one sample response/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Create form" }));
  expect(
    await screen.findByRole("link", { name: /Open form/ }),
  ).toHaveAttribute("href", "/pages/public-page");
  expect(screen.getByRole("link", { name: /Open form/ })).toHaveAttribute(
    "target",
    "_blank",
  );
  expect(screen.getByRole("link", { name: /Open form/ })).toHaveFocus();
  expect(screen.getByRole("link", { name: "View Inbox" })).toHaveAttribute(
    "href",
    "/app/inbox?sourceId=source",
  );
});
test("guards double clicks and preserves the request ID when retrying after failure", async () => {
  let reject!: (error: Error) => void;
  const create = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    )
    .mockResolvedValue(result);
  render(<CreateExampleDialog create={create} onCreated={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create example" }));
  const button = screen.getByRole("button", { name: "Create form" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(create).toHaveBeenCalledTimes(1);
  reject(new Error("Network unavailable"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Network unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Create form" }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[0][0]).toEqual(create.mock.calls[1][0]);
});
test("does not claim the sample reached Inbox when processing is incomplete", async () => {
  render(
    <CreateExampleDialog
      create={async () => ({ ...result, sampleStatus: "failed" })}
      onCreated={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create example" }));
  fireEvent.click(screen.getByRole("button", { name: "Create form" }));
  expect(
    await screen.findByText(/sample response could not be processed/i),
  ).toBeVisible();
  expect(
    screen.queryByText(/has been added to Submissions and Inbox/i),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "View Pipeline Run" }),
  ).toHaveAttribute("href", "/app/pipeline-runs/run");
});
