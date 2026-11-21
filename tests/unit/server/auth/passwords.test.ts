import { scrypt } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  hashPassword,
  isValidAdministratorPassword,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from "@/server/auth/passwords";

async function createLegacyScryptVerifier(password: string) {
  const salt = Buffer.alloc(16, 7);
  const digest = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }, (error, value) => error ? reject(error) : resolve(value));
  });
  return `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

describe("administrator passwords", () => {
  test("uses a salted memory-hard verifier", async () => {
    const password = "a password with at least twenty chars";
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(hash).toMatch(/^scrypt:v2:32768:8:3:/);
    expect(passwordHashNeedsUpgrade(hash)).toBe(false);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", hash)).resolves.toBe(false);
  });

  test("verifies the legacy profile and marks it for upgrade", async () => {
    const password = "a password with at least twenty chars";
    const legacy = await createLegacyScryptVerifier(password);

    await expect(verifyPassword(password, legacy)).resolves.toBe(true);
    expect(passwordHashNeedsUpgrade(legacy)).toBe(true);
  });

  test("accepts UI password changes only from twenty characters", () => {
    expect(isValidAdministratorPassword("too short")).toBe(false);
    expect(isValidAdministratorPassword("twenty characters long")).toBe(true);
  });
});
