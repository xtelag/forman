"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, Flex, Group, Progress, Stack, Text } from "@mantine/core";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";

export type BulkAction<Item> = {
  id: string;
  label: string;
  description: string;
  destructive?: boolean;
  eligible?: (item: Item) => boolean;
  blockedReason?: (count: number) => string;
  run: (item: Item) => Promise<unknown>;
};

/** Explicit IDs only. Scope includes filters, not pagination. All-results selection captures explicit IDs. */
export function useCollectionSelection<Item>({
  items,
  scope,
  getId,
}: {
  items: Item[];
  scope: string;
  getId: (item: Item) => string;
}) {
  const [state, setState] = useState<{ scope: string; ids: Set<string> }>({
    scope,
    ids: new Set(),
  });
  if (state.scope !== scope) setState({ scope, ids: new Set() });
  const ids = state.scope === scope ? state.ids : new Set<string>();
  const selected = items.filter((item) => ids.has(getId(item)));
  const clear = () => setState({ scope, ids: new Set() });
  const retain = (remaining: Item[]) =>
    setState({ scope, ids: new Set(remaining.map(getId)) });
  return {
    selected,
    clear,
    retain,
    selectAll: (matching: Item[]) =>
      setState({ scope, ids: new Set(matching.map(getId)) }),
    forPage: (visible: Item[], disabled = false) => ({
      allSelected:
        visible.length > 0 && visible.every((item) => ids.has(getId(item)))
          ? true
          : visible.some((item) => ids.has(getId(item)))
            ? ("indeterminate" as const)
            : false,
      isSelectable: () => !disabled,
      isSelected: (item: Item) => ids.has(getId(item)),
      onSelectAll: (checked: boolean) => {
        if (!disabled)
          setState((current) => {
            const next = new Set(current.scope === scope ? current.ids : []);
            for (const item of visible) {
              if (checked) next.add(getId(item));
              else next.delete(getId(item));
            }
            return { scope, ids: next };
          });
      },
      onSelectedChange: (item: Item, checked: boolean) => {
        if (disabled) return;
        setState((current) => {
          const next = new Set(current.scope === scope ? current.ids : []);
          if (checked) next.add(getId(item));
          else next.delete(getId(item));
          return { scope, ids: next };
        });
      },
    }),
  };
}

export function CollectionBulkActions<Item>({
  selected,
  actions,
  getName,
  onClear,
  onRetain,
  onChanged,
  onPendingChange,
  children,
  selectAll,
}: {
  children?: (controls: ReactNode) => ReactNode;
  selectAll?: { total: number; onClick: () => void };
  selected: Item[];
  actions: BulkAction<Item>[];
  getName: (item: Item) => string;
  onClear: () => void;
  onRetain: (items: Item[]) => void;
  onChanged: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const busy = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [operation, setOperation] = useState<{
    action: BulkAction<Item>;
    items: Item[];
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [retryItems, setRetryItems] = useState<Item[] | null>(null);
  async function execute() {
    if (!operation || busy.current) return;
    const items = retryItems ?? operation.items;
    setCompleted(0);
    setError("");
    setFinished(false);
    busy.current = true;
    setPending(true);
    onPendingChange(true);
    const failures: Item[] = [];
    const messages: string[] = [];
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        try {
          if (operation!.action.eligible && !operation!.action.eligible(item)) {
            throw new Error("This item is no longer eligible");
          }
          await operation!.action.run(item);
        } catch (cause) {
          failures.push(item);
          messages.push(getName(item) + ": " + (cause instanceof Error ? cause.message : "Request failed"));
        } finally {
          setCompleted(count => count + 1);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
    const succeeded = items.length - failures.length;
    onRetain(failures);
    setPending(false);
    onPendingChange(false);
    busy.current = false;
    if (failures.length) {
      setError(
        succeeded +
          " completed; " +
          failures.length +
          " failed. " +
          messages.join("; "),
      );
      setRetryItems(failures);
      setFinished(true);
    } else {
      setOperation(null);
      setRetryItems(null);
      toast.success(operation.action.label + ": " + succeeded + " completed");
    }
    onChanged();
  }
  const controls =
    selected.length > 0 ? (
      <Stack gap="xs">
        <Stack gap="xs">
          <Flex
            gap="sm"
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
          >
            <Text size="sm" fw={500} aria-live="polite">
              {selected.length} selected
            </Text>
            <Group gap="xs">
              {selectAll && selectAll.total > selected.length ? (
                <Button
                  variant="subtle"
                  disabled={pending}
                  onClick={selectAll.onClick}
                >
                  Select all {selectAll.total}
                </Button>
              ) : null}
              {actions.map((action) => {
                const blocked = selected.filter(
                  (item) => action.eligible && !action.eligible(item),
                ).length;
                return (
                  <Button
                    h={{ base: 44, sm: 36 }}
                    px="xs"
                    styles={{
                      label: { whiteSpace: "normal", textAlign: "center" },
                    }}
                    w={{ base: "calc(50% - 6px)", sm: "auto" }}
                    key={action.id}
                    color={action.destructive ? "red" : undefined}
                    variant={action.destructive ? "filled" : "default"}
                    disabled={pending || blocked > 0}
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setError("");
                      setFinished(false);
          setRetryItems(null);
          setCompleted(0);
                      setOperation({ action, items: [...selected] });
                    }}
                  >
                    {action.label}
                  </Button>
                );
              })}
              <Button
                h={{ base: 44, sm: 36 }}
                px="xs"
                styles={{
                  label: { whiteSpace: "normal", textAlign: "center" },
                }}
                w={{ base: "calc(50% - 6px)", sm: "auto" }}
                variant="default"
                disabled={pending}
                onClick={onClear}
              >
                Clear selection
              </Button>
            </Group>
          </Flex>
          {actions.map((action) => {
            const blocked = selected.filter(
              (item) => action.eligible && !action.eligible(item),
            ).length;
            return blocked && action.blockedReason ? (
              <Text key={action.id} size="sm" c="dimmed">
                {action.blockedReason(blocked)}
              </Text>
            ) : null;
          })}
        </Stack>
      </Stack>
    ) : null;
  return (
    <>
      {children ? children(controls) : controls}
      <ConfirmDialog
        opened={operation !== null}
        title={
          operation
            ? operation.action.label + " (" + operation.items.length + ")?"
            : ""
        }
        confirmLabel={finished ? "Retry failed" : operation?.action.label ?? "Confirm"}
        pendingLabel="Processing…"
        pending={pending}
        error={error}
        tone={operation?.action.destructive ? "danger" : "default"}
        returnFocusTo={trigger}
        onCancel={() => {
          setOperation(null);
          setError("");
          setFinished(false);
          setRetryItems(null);
          setCompleted(0);
        }}
        onConfirm={() => void execute()}
      >
        {operation?.action.description}
        {pending ? <Stack gap="xs" mt="sm">
          <Text size="sm" role="status">{completed} / {(retryItems ?? operation?.items ?? []).length}</Text>
          <Progress aria-label="Bulk operation progress" value={100 * completed / Math.max(1, (retryItems ?? operation?.items ?? []).length)} />
        </Stack> : null}
      </ConfirmDialog>
    </>
  );
}
