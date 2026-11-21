import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { SourceIntegrations } from "@/components/sources/source-integrations";
vi.mock("@/components/sources/source-code-block", () => ({
  SourceCodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));
vi.mock("@/components/sources/m2m-test-submission-dialog", () => ({
  M2mTestSubmissionDialog: () => null,
}));
vi.mock("@/components/sources/popup-source-preview-button", () => ({
  PopupSourcePreviewButton: () => <button>Preview popup</button>,
}));
afterEach(cleanup);
const integration = {
  examplesAvailable: true,
  endpoints: {
    submission: "https://test/submit",
    challenge: "https://test/challenge",
  },
  sourceType: "session" as const,
  sessionJavaScript: "session js",
  sessionReactJsx: "session jsx",
  browserHtml: "one-shot html",
  browserJavaScript: "one-shot js",
  reactJsx: "one-shot jsx",
  m2mCurl: "curl $FORMAN_SERVER_TOKEN",
  popupSource: "popup",
  warnings: [
    {
      variant: "info" as const,
      title: "Sample fields",
      message: "Sample values",
    },
  ],
};
test("session type and type-specific choices", async () => {
  const user = userEvent.setup();
  render(
    <SourceIntegrations
      sourceName="Contact survey"
      sourceId="s"
      serverToken="secret-token"
      integration={integration}
    />,
  );
  expect(screen.queryByText("Session integration")).not.toBeInTheDocument();
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Popup" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("session js")).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "HTML" }),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Example"), "React");
  expect(screen.getByText("session jsx")).toBeInTheDocument();
  expect(screen.queryByText("one-shot js")).not.toBeInTheDocument();
  expect(
    screen.queryByText("curl $FORMAN_SERVER_TOKEN"),
  ).not.toBeInTheDocument();
});
test("one-shot Source displays only one-shot examples", () => {
  render(
    <SourceIntegrations
      sourceName="Contact survey"
      sourceId="s"
      serverToken={null}
      integration={{
        ...integration,
        examplesAvailable: true,
        sourceType: "one-shot",
        sessionJavaScript: null,
        sessionReactJsx: null,
      }}
    />,
  );
  expect(
    screen.queryByRole("tab", { name: "Session" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Example")).toHaveValue("HTML");
  expect(screen.getByText("one-shot html")).toBeInTheDocument();
  expect(screen.queryByText("One-shot integration")).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("Sample values");
});

test("missing schema hides examples and opens fields", async () => {
  const user = userEvent.setup();
  const configure = vi.fn();
  const { rerender } = render(
    <SourceIntegrations
      sourceName="Contact survey"
      sourceId="s"
      serverToken={null}
      onConfigureFields={configure}
      integration={{ ...integration, examplesAvailable: false }}
    />,
  );
  expect(screen.getByRole("note")).toHaveTextContent(
    "Field definition required",
  );
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(screen.queryByText("session js")).not.toBeInTheDocument();
  expect(screen.getByText("POST https://test/submit")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Configure Source fields" }),
  );
  expect(configure).toHaveBeenCalledOnce();
  rerender(
    <SourceIntegrations
      sourceName="Contact survey"
      sourceId="s"
      serverToken={null}
      integration={integration}
    />,
  );
  expect(screen.getByText("session js")).toBeInTheDocument();
});

test("Popup is a One-shot example with its preview", async () => {
  const user = userEvent.setup();
  render(
    <SourceIntegrations
      sourceName="Contact"
      sourceId="s"
      serverToken={null}
      integration={{ ...integration, sourceType: "one-shot" }}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Preview popup" }),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Example"), "Popup");
  expect(screen.getByText("popup")).toBeInTheDocument();
  expect(screen.queryByText("one-shot html")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Preview popup" }),
  ).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Example"), "HTML");
  expect(
    screen.queryByRole("button", { name: "Preview popup" }),
  ).not.toBeInTheDocument();
});
