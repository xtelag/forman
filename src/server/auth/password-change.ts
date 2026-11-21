import { eq } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { administrators, administratorSessions } from "@/server/db/schema";

import { hashPassword, isValidAdministratorPassword, verifyPassword } from "./passwords";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export async function changeAdministratorPassword(
  database: FormanDatabase,
  currentPassword: string,
  nextPassword: string,
) {
  if (!isValidAdministratorPassword(nextPassword)) return false;

  const administrator = await database
    .select()
    .from(administrators)
    .where(eq(administrators.id, "admin"))
    .get();
  if (!administrator || !(await verifyPassword(currentPassword, administrator.passwordHash))) {
    return false;
  }

  const passwordHash = await hashPassword(nextPassword);
  database.transaction((transaction) => {
    transaction
      .update(administrators)
      .set({
        isInitialPassword: false,
        passwordChangedAt: new Date(),
        passwordHash,
      })
      .where(eq(administrators.id, "admin"))
      .run();
    transaction.delete(administratorSessions).run();
  });
  return true;
}
