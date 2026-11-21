import type { AdminDashboardResponse } from "@/shared/contracts/admin";

import { adminRequest } from "./client";

export function getDashboard() {
  return adminRequest<AdminDashboardResponse>("/api/admin/v1/dashboard");
}
