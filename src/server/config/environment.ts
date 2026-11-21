import { z } from "zod";

const secretSchema = z.string().min(32);

const environmentSchema = z.object({
  FORMAN_BASE_ORIGIN: z
    .string()
    .url()
    .transform((value) => new URL(value))
    .refine(
      (value) =>
        value.protocol === "https:" ||
        (value.protocol === "http:" &&
          (value.hostname === "localhost" || value.hostname.endsWith(".localhost"))),
      "FORMAN_BASE_ORIGIN must use HTTPS, except HTTP on localhost or its subdomains",
    ),
  FORMAN_DATABASE_PATH: z.string().min(1),
  FORMAN_TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  FORMAN_SESSION_SECRET: secretSchema,
  FORMAN_ALTCHA_SECRET: secretSchema,
  FORMAN_INITIAL_ADMIN_PASSWORD: z.string().min(1).default("change-me"),
  FORMAN_ADMIN_PASSWORD_RESET: z.string().min(20).optional(),
});

export type Environment = {
  baseOrigin: URL;
  databasePath: string;
  trustProxy: boolean;
  sessionSecret: string;
  altchaSecret: string;
  initialAdminPassword: string;
  adminPasswordReset?: string;
  runtimeMode: "development" | "production" | "test";
};

export function assertSafeInitialAdminPassword(environment: Environment) {
  if (
    environment.runtimeMode === "production" &&
    (environment.initialAdminPassword === "change-me" ||
      environment.initialAdminPassword.length < 20)
  ) {
    throw new Error(
      "Invalid Forman environment: FORMAN_INITIAL_ADMIN_PASSWORD must contain at least 20 characters and must not use the default value in production",
    );
  }
}

function runtimeMode(value: string | undefined): Environment["runtimeMode"] {
  return value === "development" || value === "test" || value === "production"
    ? value
    : "production";
}

export function loadEnvironment(
  values: Record<string, string | undefined>,
): Environment {
  const parsed = environmentSchema.safeParse(values);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return issue.message.startsWith(path)
          ? issue.message
          : `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`Invalid Forman environment: ${message}`);
  }

  const environment = parsed.data;
  const mode = runtimeMode(values.NODE_ENV);
  return {
    baseOrigin: environment.FORMAN_BASE_ORIGIN,
    databasePath: environment.FORMAN_DATABASE_PATH,
    trustProxy: environment.FORMAN_TRUST_PROXY,
    sessionSecret: environment.FORMAN_SESSION_SECRET,
    altchaSecret: environment.FORMAN_ALTCHA_SECRET,
    initialAdminPassword: environment.FORMAN_INITIAL_ADMIN_PASSWORD,
    adminPasswordReset: environment.FORMAN_ADMIN_PASSWORD_RESET,
    runtimeMode: mode,
  };
}
