import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto";
import { promisify } from "node:util";

const MAGIC = Buffer.from("FORMANBK", "ascii");
const FORMAT_VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + SALT_BYTES + IV_BYTES + TAG_BYTES;
const MINIMUM_PASSWORD_LENGTH = 12;
const deriveKey = promisify(scrypt);

async function backupKey(password: string, salt: Buffer) {
  return (await deriveKey(password, salt, 32)) as Buffer;
}

function requirePassword(password: string) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error("Backup password must contain at least 12 characters");
  }
}

export function isEncryptedBackup(input: Buffer) {
  return input.subarray(0, MAGIC.length).equals(MAGIC);
}

export async function encryptBackup(sqlite: Buffer, password: string) {
  requirePassword(password);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await backupKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(sqlite), cipher.final()]);

  return Buffer.concat([
    MAGIC,
    Buffer.from([FORMAT_VERSION]),
    salt,
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

export async function decodeBackup(input: Buffer, password?: string) {
  if (!isEncryptedBackup(input)) return input;
  if (input.length < HEADER_BYTES || input[MAGIC.length] !== FORMAT_VERSION) {
    throw new Error("This backup format is not supported");
  }
  if (!password) throw new Error("This backup requires a password");
  requirePassword(password);

  const saltStart = MAGIC.length + 1;
  const ivStart = saltStart + SALT_BYTES;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  const key = await backupKey(
    password,
    input.subarray(saltStart, ivStart),
  );

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      input.subarray(ivStart, tagStart),
    );
    decipher.setAuthTag(input.subarray(tagStart, ciphertextStart));
    return Buffer.concat([
      decipher.update(input.subarray(ciphertextStart)),
      decipher.final(),
    ]);
  } catch {
    throw new Error("The backup password is incorrect or the file is damaged");
  }
}
