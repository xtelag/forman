import { eq } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { administrators } from "@/server/db/schema";

import { LoginAttemptLimiter } from "./login-limiter";
import {
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from "./passwords";
import { createSession } from "./sessions";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export async function loginAdministrator(
  database: FormanDatabase,
  limiter: LoginAttemptLimiter,
  clientAddress: string,
  password: string,
) {
  if (limiter.isLimited(clientAddress)) return null;

  const administrator = await database
    .select()
    .from(administrators)
    .where(eq(administrators.id, "admin"))
    .get();

  if (!administrator || !(await verifyPassword(password, administrator.passwordHash))) {
    limiter.recordFailure(clientAddress);
    return null;
  }

  if (passwordHashNeedsUpgrade(administrator.passwordHash)) {
    await database
      .update(administrators)
      .set({
        passwordChangedAt: new Date(),
        passwordHash: await hashPassword(password),
      })
      .where(eq(administrators.id, administrator.id));
  }

  limiter.clear(clientAddress);
  return createSession(database);
}

export async function getAdministratorInitialPasswordState(database: FormanDatabase) {
  const administrator = await database
    .select({ isInitialPassword: administrators.isInitialPassword })
    .from(administrators)
    .where(eq(administrators.id, "admin"))
    .get();
  return administrator?.isInitialPassword ?? true;
}
