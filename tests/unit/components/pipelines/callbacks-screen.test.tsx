import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CallbacksScreen } from "@/components/pipelines/callbacks-screen";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));
vi.mock("@/components/layout/app-link", () => ({
  AppLink: ({ children, href, ...properties }: React.ComponentProps<"a">) => <a href={href} {...properties}>{children}</a>,
  useAppNavigation: () => ({ go }),
}));

describe("CallbacksScreen", () => {
  test("preserves the Dashboard age filter when applying other queue filters", async () => {
    const loadCallbacks = vi.fn().mockResolvedValue({ items: [], total: 0 });
    render(<CallbacksScreen initialQuery={{ olderThanMinutes: 60 }} loadCallbacks={loadCallbacks} loadPipelines={async () => []} loadSources={async () => []} loadTags={async () => []} />);
    const age = await screen.findByLabelText("Waiting at least");
    expect(age).toHaveValue("60");
    expect(loadCallbacks).toHaveBeenCalledWith(expect.objectContaining({ olderThanMinutes: 60 }));
    fireEvent.click(screen.getByRole("button", {name: /^Filters/}));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(go).toHaveBeenLastCalledWith("/app/callbacks?olderThanMinutes=60");
    fireEvent.change(age, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", {name: /^Filters/}));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(go).toHaveBeenLastCalledWith("/app/callbacks");
  });

  afterEach(cleanup);

  test("shows a waiting Callback with operational context and an expiry", async () => {
    render(<CallbacksScreen loadCallbacks={async () => ({ items: [{ actionName: "Await approval", actionType: "callback", callbackExpiresAt: "2026-09-03T11:00:00.000Z", id: "callback", pipelineId: "pipeline", pipelineName: "Approval", runId: "run", sourceId: "source", sourceName: "Leads", waitingSince: "2026-09-03T10:00:00.000Z" }], total: 1 })} loadPipelines={async () => []} loadSources={async () => [{ createdAt: "2026-09-01T00:00:00.000Z", enabled: true, fieldDefinitionMode: null, fieldDefinitionSource: null, id: "source", lastSubmission: null, name: "Contact", type: "one-shot" as const, pipelineCount: 1, pageCount: 0, sourceId: "public-source", submissionsLast30Days: 0, totalSubmissionCount: 0, submissionsLast24Hours: 0, submissionsLast7Days: 0, tags: [{ id: "vip", name: "VIP", color: "blue" }], updatedAt: "2026-09-01T00:00:00.000Z" }]} loadTags={async () => []} />);

    expect(await screen.findByRole("heading", { name: "Waiting Callbacks" })).toBeVisible();
    expect(screen.getAllByText("Await approval")[0]).toBeVisible();
    expect(screen.queryAllByRole("link", {name:"Approval"})).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button",{name:"Actions for Callback callback"})[0]);
    expect(screen.getByRole("menuitem", {name:"Open waiting Action"})).toHaveAttribute("href", "/app/pipeline-runs/run#callback");
    expect(screen.getByRole("menuitem", {name:"Open Pipeline"})).toHaveAttribute("href", "/app/pipelines/pipeline");
    expect(screen.getByRole("menuitem", {name:"Open Source"})).toHaveAttribute("href", "/app/sources/public-source");
    expect(screen.getAllByText("Callback")).toHaveLength(1);
    expect(screen.getAllByText("Expires")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: "Tags" })).toBeInTheDocument();
    expect(screen.getAllByText("VIP")).toHaveLength(1);
  });

  test("explains when no Callback is waiting", async () => {
    render(<CallbacksScreen loadCallbacks={async () => ({ items: [], total: 0 })} loadPipelines={async () => []} loadSources={async () => []} loadTags={async () => []} />);
    expect(await screen.findByText("No Waiting Callbacks")).toBeVisible();
  });
});
