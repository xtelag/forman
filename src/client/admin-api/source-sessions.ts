import type { AdminSourceSessions, SessionSettings } from "@/shared/contracts/source-session";
import { adminRequest } from "./client";
export const sessionAdminPath = (sourceId: string) => `/api/admin/v1/sources/${encodeURIComponent(sourceId)}/sessions`;
export const listSourceSessions = (sourceId: string, query = "") => adminRequest<AdminSourceSessions>(`${sessionAdminPath(sourceId)}${query ? `?${query}` : ""}`);
export const saveSessionSettings = (sourceId: string, settings: SessionSettings) => adminRequest<SessionSettings>(sessionAdminPath(sourceId), { method: "PATCH", body: JSON.stringify(settings) });
