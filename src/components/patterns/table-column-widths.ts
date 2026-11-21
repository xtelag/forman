type Column = { id: string; width?: number; sizing?: "action" | "compact" };

// Shared minimum widths. Tags absorbs spare space inside a full-width table.
const widths: Record<string, number> = {
  name: 260, source: 260, pipeline: 260, action: 260,
  preview: 420, tags: 280,
  received: 176, submitted: 176, updated: 176, started: 176,
  waiting: 176, expires: 176, "last-submission": 176,
  type: 112, state: 160, status: 160, progress: 160,
  steps: 96, pipelines: 104, submissions: 140,
};

export function tableColumnWidths(columns: Column[], selectionWidth = 0) {
  const width = (column: Column): number =>
    column.sizing === "action" ? 64 :
    widths[column.id] ?? column.width ?? (column.sizing === "compact" ? 112 : 260);
  const flexibleColumn = columns.find((column) => column.id === "tags")
    ?? columns.find((column) => ["name", "source", "pipeline", "preview"].includes(column.id))
    ?? columns.find((column) => column.sizing !== "action");
  return {
    displayWidth: (column: Column) => column.id === flexibleColumn?.id ? undefined : width(column),
    totalWidth: columns.reduce((sum, column) => sum + width(column), selectionWidth),
    width,
  };
}
