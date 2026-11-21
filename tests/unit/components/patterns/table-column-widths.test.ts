import { describe, expect, test } from "vitest";
import { tableColumnWidths } from "@/components/patterns/table-column-widths";

describe("table column widths", () => {
  test("preserves Source and Tags widths regardless of peer columns", () => {
    const small = tableColumnWidths([{ id: "source" }, { id: "tags", width: 160 }]);
    const large = tableColumnWidths([{ id: "source" }, { id: "pipeline" }, { id: "status" }, { id: "tags" }]);
    for (const layout of [small, large]) {
      expect(layout.width({ id: "source" })).toBe(260);
      expect(layout.width({ id: "tags", width: 160 })).toBe(280);
    }
  });
  test("computes the minimum table width from columns and selection", () => {
    const layout = tableColumnWidths([{ id: "source" }, { id: "tags" }, { id: "received" }, { id: "actions", sizing: "action" }], 48);
    expect(layout.totalWidth).toBe(828);
    expect(layout.width({ id: "actions", sizing: "action" })).toBe(64);
  });
  test("only Tags absorbs spare width when present", () => {
    const layout = tableColumnWidths([{ id: "source" }, { id: "tags" }, { id: "actions", sizing: "action" }]);
    expect(layout.displayWidth({ id: "source" })).toBe(260);
    expect(layout.displayWidth({ id: "tags" })).toBeUndefined();
    expect(layout.displayWidth({ id: "actions", sizing: "action" })).toBe(64);
  });
  test("a main name absorbs spare width without Tags", () => {
    const layout = tableColumnWidths([{ id: "name" }, { id: "status" }]);
    expect(layout.displayWidth({ id: "name" })).toBeUndefined();
    expect(layout.displayWidth({ id: "status" })).toBe(160);
  });
  test("also sizes embedded tables without Tags", () => {
    expect(tableColumnWidths([{ id: "source" }, { id: "received" }]).totalWidth).toBe(436);
    expect(tableColumnWidths([{ id: "preview" }]).totalWidth).toBe(420);
  });
});
