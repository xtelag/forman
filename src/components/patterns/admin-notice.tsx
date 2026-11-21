"use client";
import { Alert, type AlertProps } from "@mantine/core";
import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { forwardRef } from "react";

/** Contextual notices share one palette, icon size and accessible behavior. */
export const AdminNotice = forwardRef<HTMLDivElement, AlertProps>(function AdminNotice(
  { color = "blue", role, ...props }, ref,
) {
  const severity = color === "red" ? "error" : color === "yellow" || color === "orange" ? "warning" : color === "green" ? "success" : "info";
  const Icon = severity === "error" ? CircleAlert : severity === "warning" ? TriangleAlert : severity === "success" ? Check : Info;
  return (
    <Alert
      ref={ref}
      p="md"
      radius="md"
      {...props}
      color={severity === "error" ? "red" : severity === "warning" ? "yellow" : severity === "success" ? "green" : "blue"}
      variant="light"
      role={role ?? (severity === "error" ? "alert" : "status")}
      data-variant={severity}
      icon={<Icon size={18} aria-hidden="true" />}
    />
  );
});
