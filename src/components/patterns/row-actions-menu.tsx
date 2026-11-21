"use client";
import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import { restoreFocusAfterDialog } from "@/client/focus-management";
import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";

/** One menu trigger and touch target across desktop tables and mobile cards. */
export function RowActionsMenu({
  label,
  children,
  disabled,
  triggerRef,
  detail = false,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  detail?: boolean;
}) {
  const interacted = useRef(false);
  useEffect(
    () => () => {
      if (interacted.current) restoreFocusAfterDialog();
    },
    [],
  );
  const [opened, setOpened] = useState(false);
  return (
    <Menu
      opened={opened}
      onChange={(value) => {
        if (value) interacted.current = true;
        setOpened(value);
      }}
      position="bottom-end"
      middlewares={{
        flip: { fallbackStrategy: "bestFit" },
        shift: { crossAxis: true, padding: 12 },
      }}
      withinPortal
      width={240}
      styles={{ item: { minHeight: 44 } }}
    >
      <Menu.Target>
        <Tooltip label={label} disabled={opened} withArrow>
          <ActionIcon
            ref={triggerRef}
            aria-label={label}
            disabled={disabled}
            variant={detail ? "default" : "subtle"}
            color="gray"
            w={{ base: 44, md: detail ? 44 : 32 }}
            h={{ base: 44, md: detail ? 44 : 32 }}
          >
            <MoreVertical size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown mah="calc(100dvh - 24px)" style={{ overflowY: "auto" }}>
        {children}
      </Menu.Dropdown>
    </Menu>
  );
}
