import { describe, expect, test } from "vitest";

import {
  decodeBackup,
  encryptBackup,
  isEncryptedBackup,
} from "@/server/backup/backup-envelope";

const sqlite = Buffer.concat([
  Buffer.from("SQLite format 3\0", "ascii"),
  Buffer.alloc(256, 7),
]);

describe("backup envelope", () => {
  test("passes a plaintext SQLite backup through unchanged", async () => {
    expect(isEncryptedBackup(sqlite)).toBe(false);
    expect(await decodeBackup(sqlite)).toEqual(sqlite);
  });

  test("encrypts and authenticates a backup with its password", async () => {
    const encrypted = await encryptBackup(sqlite, "correct horse battery staple");

    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(encrypted).not.toContain(Buffer.from("SQLite format 3\0"));
    expect(
      await decodeBackup(encrypted, "correct horse battery staple"),
    ).toEqual(sqlite);
  });

  test("rejects short backup passwords", async () => {
    await expect(encryptBackup(sqlite, "too-short")).rejects.toThrow(
      "Backup password must contain at least 12 characters",
    );
  });

  test("rejects an encrypted backup without the correct password", async () => {
    const encrypted = await encryptBackup(sqlite, "correct horse battery staple");

    await expect(decodeBackup(encrypted)).rejects.toThrow(
      "This backup requires a password",
    );
    await expect(decodeBackup(encrypted, "incorrect password")).rejects.toThrow(
      "The backup password is incorrect or the file is damaged",
    );
  });

  test("rejects a modified encrypted backup", async () => {
    const encrypted = await encryptBackup(sqlite, "correct horse battery staple");
    encrypted[encrypted.length - 1] ^= 1;

    await expect(
      decodeBackup(encrypted, "correct horse battery staple"),
    ).rejects.toThrow("The backup password is incorrect or the file is damaged");
  });

  test("rejects an unknown encrypted backup version", async () => {
    const encrypted = await encryptBackup(sqlite, "correct horse battery staple");
    encrypted[8] = 99;

    await expect(
      decodeBackup(encrypted, "correct horse battery staple"),
    ).rejects.toThrow("This backup format is not supported");
  });
});
