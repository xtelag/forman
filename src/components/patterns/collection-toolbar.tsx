"use client";
import { Box } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./collection-toolbar.module.css";

export function CollectionToolbar({
  search,
  tags,
  filters,
}: {
  search: ReactNode;
  tags?: ReactNode;
  filters: ReactNode;
}) {
  return (
    <Box className={classes.container}>
      <Box className={classes.toolbar}>
        <Box className={classes.search}>{search}</Box>
        <Box className={classes.tags}>{tags}</Box>
        <Box className={classes.filters}>{filters}</Box>
      </Box>
    </Box>
  );
}
