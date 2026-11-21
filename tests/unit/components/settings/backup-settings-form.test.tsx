import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BackupSettingsForm } from "@/components/settings/backup-settings-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("BackupSettingsForm", () => {
  afterEach(cleanup);

  test("downloads a complete backup with an optional password", async () => {
    const user = userEvent.setup();
    const downloadBackup = vi.fn().mockResolvedValue(undefined);
    render(<BackupSettingsForm downloadBackup={downloadBackup} />);

    await user.type(
      screen.getByLabelText("Password (optional, 12+ characters)"),
      "correct horse battery staple",
    );
    await user.click(
      screen.getByRole("button", { name: "Download backup" }),
    );

    expect(downloadBackup).toHaveBeenCalledWith("correct horse battery staple");
  });

  test("requires destructive confirmation before restoring a backup", async () => {
    const user = userEvent.setup();
    const restoreBackup = vi.fn().mockResolvedValue(undefined);
    const onRestored = vi.fn();
    render(
      <BackupSettingsForm
        onRestored={onRestored}
        restoreBackup={restoreBackup}
      />,
    );
    const file = new File(["backup"], "forman.sqlite", {
      type: "application/octet-stream",
    });

    await user.upload(screen.getByLabelText("Upload backup file"), file);
    await user.click(screen.getByRole("button", { name: "Restore backup" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Permanently replaces all current data");
    expect(dialog).toHaveTextContent("administrator credentials");
    expect(dialog).toHaveTextContent("disables restored Pipelines");
    expect(restoreBackup).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Restore backup" }),
    );

    expect(restoreBackup).toHaveBeenCalledWith(file, undefined);
    expect(onRestored).toHaveBeenCalledOnce();
  });

  test("keeps a restore failure next to the backup controls", async () => {
    const user = userEvent.setup();
    render(
      <BackupSettingsForm
        restoreBackup={vi.fn().mockRejectedValue(new Error("Wrong password"))}
      />,
    );
    await user.upload(
      screen.getByLabelText("Upload backup file"),
      new File(["backup"], "forman.forman-backup"),
    );
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Restore backup",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wrong password",
    );
  });
});
