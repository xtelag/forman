import type { AdminApplicationResponse } from "@/shared/contracts/admin";

import { adminRequest } from "./client";

export function getApplication() {
  return adminRequest<AdminApplicationResponse>("/api/admin/v1/application");
}
