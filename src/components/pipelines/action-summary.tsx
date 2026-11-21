import { Box, Text } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./action-summary.module.css";

export function ActionSummary({ name, position, type, processing, status }: {
  name: string; position: number; type: string; processing: string; status: ReactNode;
}) {
  return (
    <Box component="span" className={classes.summary}>
      <Text component="span" fw={600} truncate title={name} className={classes.name}>
        <span className={classes.accessible}>Action </span>{position}. {name}
      </Text>
      <Box component="span" className={classes.metadata}>
      <Text component="span" size="sm" c="dimmed" truncate title={type}>Type: {type}</Text>
      {processing ? <Text component="span" size="sm" c="dimmed" truncate title={processing}>· {processing}</Text> : null}
      <Box component="span" className={classes.status}>{status}</Box>
      </Box>
    </Box>
  );
}
