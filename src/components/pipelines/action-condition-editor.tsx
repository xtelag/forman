"use client";
import { FormFields } from "@/components/patterns/form-layout";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import type {
  ActionCondition,
  ActionConditionOperator,
} from "@/shared/contracts/action-condition";
const operators: Array<{ label: string; value: ActionConditionOperator }> = [
  { label: "equals", value: "equals" },
  { label: "does not equal", value: "notEquals" },
  { label: "contains", value: "contains" },
  { label: "does not contain", value: "notContains" },
  { label: "exists", value: "exists" },
  { label: "is empty", value: "isEmpty" },
];
const needsValue = (operator: ActionConditionOperator) =>
  operator !== "exists" && operator !== "isEmpty";
export function ActionConditionEditor({
  besideSelector,
  alwaysLabel = "Always run",
  conditionalLabel = "Only when conditions match",
  description = "Run for all Submissions or only those matching a condition.",
  embedded = false,
  inline = false,
  onChange,
  title = "Run condition",
  value,
}: {
  besideSelector?: ReactNode;
  alwaysLabel?: string;
  conditionalLabel?: string;
  description?: string;
  embedded?: boolean;
  inline?: boolean;
  onChange: (value: ActionCondition | null) => void;
  title?: string;
  value: ActionCondition | null | undefined;
}) {
  const id = useId();
  const condition = value ?? null;
  function updateRule(
    index: number,
    update: Partial<ActionCondition["conditions"][number]>,
  ) {
    if (!condition) return;
    onChange({
      ...condition,
      conditions: condition.conditions.map((rule, current) =>
        current === index ? { ...rule, ...update } : rule,
      ),
    });
  }
  const selector = (
    <Select
      id={id}
      label={title}
      description={description}
      inputWrapperOrder={["label", "input", "description", "error"]}
      value={condition ? "conditional" : "always"}
      onChange={(next) => {
        if (next)
          onChange(
            next === "always"
              ? null
              : {
                  mode: "all",
                  conditions: [{ field: "", operator: "equals", value: "" }],
                },
          );
      }}
      data={[
        { value: "always", label: alwaysLabel },
        { value: "conditional", label: conditionalLabel },
      ]}
    />
  );
  return (
    <Paper
      component="section"
      aria-label={title}
      withBorder={!embedded}
      p={embedded ? 0 : "md"}
      radius="md"
      bg={embedded ? "transparent" : undefined}
      style={inline ? { gridColumn: "1 / -1" } : undefined}
    >
      <Stack gap="sm">
        {besideSelector ? (
          <FormFields>
            {selector}
            {besideSelector}
          </FormFields>
        ) : (
          selector
        )}
        {condition ? (
          <>
            <Divider />
            <Select
              label="Condition match mode"
              value={condition.mode}
              onChange={(mode) => {
                if (mode)
                  onChange({
                    ...condition,
                    mode: mode as ActionCondition["mode"],
                  });
              }}
              data={[
                { value: "all", label: "All rules" },
                { value: "any", label: "Any rule" },
              ]}
              maw={240}
            />
            {condition.conditions.map((rule, index) => (
              <Group key={index} align="flex-end" wrap="nowrap" gap="xs">
                <Box style={{ flex: 1 }} miw={0}>
                  <FormFields>
                    <TextInput
                      label="Field"
                      aria-label={"Condition " + (index + 1) + " field"}
                      value={rule.field}
                      placeholder="Field"
                      onChange={(event) =>
                        updateRule(index, { field: event.target.value })
                      }
                    />
                    <Select
                      label="Operator"
                      aria-label={"Condition " + (index + 1) + " operator"}
                      value={rule.operator}
                      data={operators}
                      onChange={(operator) => {
                        if (operator)
                          updateRule(index, {
                            operator: operator as ActionConditionOperator,
                            value: needsValue(
                              operator as ActionConditionOperator,
                            )
                              ? (rule.value ?? "")
                              : undefined,
                          });
                      }}
                    />
                    {needsValue(rule.operator) ? (
                      <TextInput
                        label="Value"
                        aria-label={"Condition " + (index + 1) + " value"}
                        value={rule.value ?? ""}
                        placeholder="Value"
                        onChange={(event) =>
                          updateRule(index, { value: event.target.value })
                        }
                      />
                    ) : (
                      <Box visibleFrom="sm" />
                    )}
                  </FormFields>
                </Box>
                <ActionIcon
                  aria-label={"Remove condition " + (index + 1)}
                  disabled={condition.conditions.length === 1}
                  onClick={() =>
                    onChange({
                      ...condition,
                      conditions: condition.conditions.filter(
                        (_, current) => current !== index,
                      ),
                    })
                  }
                  variant="subtle"
                  color="gray"
                  size="lg"
                  type="button"
                >
                  <Trash2 size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Group>
              <Button
                onClick={() =>
                  onChange({
                    ...condition,
                    conditions: [
                      ...condition.conditions,
                      { field: "", operator: "equals", value: "" },
                    ],
                  })
                }
                leftSection={<Plus size={16} />}
                size="sm"
                type="button"
                variant="default"
              >
                Add condition
              </Button>
            </Group>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}
