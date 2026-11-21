"use client";
import { Menu } from "@mantine/core";
import { AppLink } from "@/components/layout/app-link";

export function RowNavigationItems({
  items,
}: {
  items: (false | null | undefined | { label: string; href: string })[];
}) {
  return (
    <>
      {items.map((item) =>
        item ? (
          <Menu.Item key={item.label} component={AppLink} href={item.href}>
            {item.label}
          </Menu.Item>
        ) : null,
      )}
    </>
  );
}
