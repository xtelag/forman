"use client";

import { ActionIcon, Box, Tooltip, type ActionIconProps } from "@mantine/core";
import type { ComponentPropsWithoutRef } from "react";

type IconButtonProps = ActionIconProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof ActionIconProps> & {
    "aria-label": string;
  };

/** Icon actions share a hover/focus explanation and accessible name. */
export function IconButton({ "aria-label": label, ...props }: IconButtonProps) {
  const button = <ActionIcon aria-label={label} {...props} />;
  return (
    <Tooltip label={label} events={{ hover: true, focus: true, touch: false }}>
      {props.disabled ? (
        <Box
          component="span"
          display="inline-flex"
          tabIndex={0}
          role="group"
          aria-label={label}
        >
          {button}
        </Box>
      ) : (
        button
      )}
    </Tooltip>
  );
}
