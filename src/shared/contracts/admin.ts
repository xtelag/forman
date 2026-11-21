import type { StoredSubmissionPayload } from "./submission";
import type { PagePresentation } from "@/shared/contracts/page";

export type AdminDashboardSummary = {
  activeSourceCount: number;
  failedActionCount: number;
  waitingCallbackCount: number;
  recentSubmissions: AdminSubmission[];
  submissionsLast24Hours: number;
  submissionsLast7Days: number;
  submissionsLast30Days: number;
  totalSubmissionCount: number;
};

export type AdminDashboardResponse = {
  isInitialPassword: boolean;
  summary: AdminDashboardSummary;
};

export type AdminSettings = {
  adminSessionIdleDays: number;
  adminSessionAbsoluteDays: number;
  altchaMaxNumber: number;
  challengeRateLimitPerMinute: number;
  challengeTtlSeconds: number;
  clientBurstLimit: number;
  clientRateLimitPerMinute: number;
  sourceRateLimitPerMinute: number;
  formspreeCompatibilityEndpointEnabled: boolean;
  failedActionRetentionDays: number;
  inboxRetentionDays: number;
  loginFailureLimit: number;
  loginFailureWindowSeconds: number;
  rateLimiterCapacity: number;
  rateLimiterTtlSeconds: number;
  robotsTxt: string;
  submissionRateLimitPerMinute: number;
  webhookSsrfProtectionEnabled: boolean;
  smtp: AdminSmtpSettings;
  updatedAt: string;
};

export type AdminSmtpSettings = {
  authentication?: boolean;
  fromName?: string | null;
  from: string | null;
  host: string | null;
  passwordConfigured: boolean;
  port: number | null;
  encryption: "tls" | "starttls" | "none";
  status: "not-configured" | "ready";
  username: string | null;
};

export type AdminApplicationResponse = {
  baseUrl: string;
  isProduction: boolean;
};

export type AdminSourceDetail = {
  type: import("../source-type").SourceType;
  allowedOrigins: string[];
  altchaEnabled: boolean;
  challengeRateLimitPerMinute: number | null;
  createdAt: string;
  enabled: boolean;
  fieldDefinitionMode?: "json-schema" | null;
  fieldDefinitionSource?: string | null;
  sourceId: string;
  honeypotEnabled: boolean;
  honeypotFieldNames?: string[];
  id: string;
  maxBodyBytes: number;
  maxEntries: number;
  maxKeyLength: number;
  maxUniqueKeys: number;
  maxValueLength: number;
  maxValuesPerKey: number;
  name: string;
  retentionDays: number | null;
  serverTokenPrefix: string | null;
  storeReferer: boolean;
  storeUserAgent: boolean;
  submissionRateLimitPerMinute: number | null;
  successUrl: string | null;
  tags?: AdminTag[];
  updatedAt: string;
};

export type AdminTag = {
  color:
    | "rose"
    | "coral"
    | "peach"
    | "amber"
    | "lemon"
    | "mint"
    | "emerald"
    | "teal"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "fuchsia";
  id: string;
  name: string;
};

export type AdminSourceDetailResponse = {
  pageCount: number;
  pipelines: Array<{
    enabled: boolean;
    id: string;
    name: string;
    steps: Array<{ enabled: boolean }>;
  }>;
  source: AdminSourceDetail;
  observedFieldNames: string[];
  submissionCount: number;
  sessionSettings: import("./source-session").SessionSettings;
  integration: {
    examplesAvailable: boolean;
    sourceType: import("../source-type").SourceType;
    endpoints: { submission: string; challenge: string | null };
    sessionJavaScript: string | null;
    sessionReactJsx: string | null;
    warnings: Array<{
      variant: "info" | "warning";
      title: string;
      message: string;
    }>;
    browserHtml: string;
    browserJavaScript: string;
    reactJsx: string;
    m2mCurl: string;
    popupSource: string;
  };
};

export type AdminPageSummary = {
  sourceEnabled?: boolean;
  createdAt: string;
  enabled: boolean;
  sourceId: string;
  sourceName: string;
  sourcePublicId: string;
  id: string;
  name: string;
  pageId: string;
  publicUrl: string;
  tags: AdminTag[];
  updatedAt: string;
};

export type AdminPageDetail = AdminPageSummary & {
  sessionsEnabled?: boolean;
  fields?: import("@/shared/contracts/page").PageField[];
  presentation: PagePresentation | null;
};

export type AdminPagesResponse = {
  items: AdminPageSummary[];
};

export type AdminSubmission = {
  type?: "one-shot" | "session";
  state?: "draft" | "completed" | "expired";
  meta?: { sessionUpdateCount: number; sessionRequestCount: number };
  createdAt: string;
  sourceId: string;
  sourcePublicId: string;
  sourceName: string;
  id: string;
  payload: StoredSubmissionPayload;
  referer: string | null;
  tags: AdminTag[];
  userAgent: string | null;
};

export type AdminPipelineRunStatus =
  "pending" | "processing" | "completed" | "completed_attention" | "cancelled";

export type AdminSubmissionPipelineRun = {
  actionCount: number;
  completedActionCount: number;
  createdAt: string;
  failedActionCount: number;
  id: string;
  pipelineId: string | null;
  pipelineName: string;
  processingActionCount: number;
  skippedConditionCount: number;
  status: AdminPipelineRunStatus;
  updatedAt: string;
};

export type AdminSubmissionDetail = AdminSubmission & {
  pipelineRuns: AdminSubmissionPipelineRun[];
};

export type AdminSubmissionsResponse = {
  snapshotBefore?: string;
  deletableTotal?: number;
  items: AdminSubmission[];
  total: number;
};

export type SubmissionFilter = {
  type?: string;
  state?: string;
  sourceId?: string;
  from?: string;
  search?: string;
  tagIds?: string[];
  to?: string;
};

export type SubmissionDeleteSelection =
  | { ids: string[]; type: "ids" }
  | {
      excludedIds: string[];
      filter: SubmissionFilter;
      snapshotBefore: string;
      type: "filter";
    };
