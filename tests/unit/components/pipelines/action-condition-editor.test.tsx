import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { ActionConditionEditor } from "@/components/pipelines/action-condition-editor";
import type { ActionCondition } from "@/shared/contracts/action-condition";
afterEach(cleanup);
test("keeps focus while typing a condition field", async () => {
  function Editor() {
    const [value, setValue] = useState<ActionCondition | null>({
      mode: "all",
      conditions: [{ field: "", operator: "equals", value: "" }],
    });
    return <ActionConditionEditor value={value} onChange={setValue} />;
  }
  render(<Editor />);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Condition 1 field" }),
    "email",
  );
  expect(
    screen.getByRole("textbox", { name: "Condition 1 field" }),
  ).toHaveValue("email");
  expect(
    screen.getByRole("textbox", { name: "Condition 1 field" }),
  ).toHaveFocus();
});
