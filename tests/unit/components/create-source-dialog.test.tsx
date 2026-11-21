import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CreateSourceDialog } from "@/components/sources/create-source-dialog";
import { AdminApiError } from "@/client/admin-api/client";

const { createSource, go, refresh } = vi.hoisted(() => ({
  createSource: vi.fn(),
  go: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/client/admin-api/sources", () => ({ createSource }));
vi.mock("@/components/layout/app-link", () => ({
  useAppNavigation: () => ({ go, refresh }),
}));

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("CreateSourceDialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    createSource.mockReset();
    go.mockReset();
    refresh.mockReset();
    createSource.mockResolvedValue({ sourceId: "new-form" });
  });

  test("creates a form through the portable admin client and opens its detail page through the navigation adapter", async () => {
    render(
      <CreateSourceDialog
        trigger={<button type="button">Open dialog</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Contact" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Source" }));

    await waitFor(() =>
      expect(createSource).toHaveBeenCalledWith({
        name: "Contact",
        type: "one-shot",
      }),
    );
    await waitFor(() =>
      expect(go).toHaveBeenCalledWith("/app/sources/new-form"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  test.each(["session", "m2m"])(
    "creates the selected %s intake type",
    async (type) => {
      render(
        <CreateSourceDialog
          trigger={<button type="button">Open dialog</button>}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
      fireEvent.change(
        screen.getByLabelText(/^Name/),
        { target: { value: "Contact" } },
      );
      fireEvent.click(
        screen.getByRole("radio", {
          name: type === "session" ? /^Session/ : /^M2M/,
        }),
      );
      expect(screen.queryByText("The Source type cannot be changed after creation.")).not.toBeInTheDocument();
      fireEvent.focus(screen.getByRole("button", { name: "About Source type" }));
      expect(await screen.findByRole("tooltip")).toHaveTextContent("The Source type cannot be changed after creation.");
      fireEvent.blur(screen.getByRole("button", { name: "About Source type" }));
      fireEvent.click(screen.getByRole("button", { name: "Create Source" }));
      await waitFor(() =>
        expect(createSource).toHaveBeenCalledWith({ name: "Contact", type }),
      );
    },
  );

  test("explains when the friendly name is already in use", async () => {
    createSource.mockRejectedValue(
      new AdminApiError(409, "translated response"),
    );
    render(
      <CreateSourceDialog
        trigger={<button type="button">Open dialog</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Contact" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Source" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not create Source");
    expect(alert).toHaveTextContent(
      "A Source with this name already exists",
    );
    expect(alert.querySelector("svg")).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });

  test("keeps every dismissal path closed while a create request is pending", async () => {
    const request = deferred<{ sourceId: string }>();
    createSource.mockReturnValue(request.promise);
    render(
      <CreateSourceDialog
        trigger={<button type="button">Open dialog</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Contact" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Source" }));

    await waitFor(() =>
      expect(createSource).toHaveBeenCalledWith({
        name: "Contact",
        type: "one-shot",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled(),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    const overlay = document.querySelector('.mantine-Modal-overlay');
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay!);
    expect(
      screen.getByRole("dialog", { name: "Create Source" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();

    request.resolve({ sourceId: "new-form" });
    await waitFor(() =>
      expect(go).toHaveBeenCalledWith("/app/sources/new-form"),
    );
  });

  test("clears a submit error when the dialog is closed and opened again", async () => {
    createSource.mockRejectedValue(
      new AdminApiError(409, "translated response"),
    );
    render(
      <CreateSourceDialog
        trigger={<button type="button">Open dialog</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Contact" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Source" }));
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "A Source with this name already exists",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
