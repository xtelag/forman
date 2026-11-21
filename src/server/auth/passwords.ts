import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const derivedKeyLength = 64;
const currentProfile = { N: 32_768, r: 8, p: 3 } as const;
const legacyProfile = { N: 16_384, r: 8, p: 1 } as const;
const maximumMemory = 128 * 1024 * 1024;
const base64Url = /^[A-Za-z0-9_-]+$/;

type ScryptProfile = { N: number; r: number; p: number };

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  profile: ScryptProfile,
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { ...profile, maxmem: maximumMemory }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function decodeValue(value: string, expectedLength: number) {
  if (!base64Url.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedLength ? decoded : null;
}

function parseVerifier(verifier: string) {
  const current = verifier.split(":");
  if (
    current.length === 7 &&
    current[0] === "scrypt" &&
    current[1] === "v2" &&
    current[2] === String(currentProfile.N) &&
    current[3] === String(currentProfile.r) &&
    current[4] === String(currentProfile.p)
  ) {
    const salt = decodeValue(current[5], 16);
    const expected = decodeValue(current[6], derivedKeyLength);
    return salt && expected
      ? { current: true, expected, profile: currentProfile, salt }
      : null;
  }

  const legacy = verifier.split("$");
  if (legacy.length !== 3 || legacy[0] !== "scrypt") return null;
  const salt = decodeValue(legacy[1], 16);
  const expected = decodeValue(legacy[2], derivedKeyLength);
  return salt && expected
    ? { current: false, expected, profile: legacyProfile, salt }
    : null;
}

export function isValidAdministratorPassword(password: string) {
  return password.length >= 20;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, derivedKeyLength, currentProfile);
  return [
    "scrypt",
    "v2",
    currentProfile.N,
    currentProfile.r,
    currentProfile.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join(":");
}

export function passwordHashNeedsUpgrade(verifier: string) {
  return parseVerifier(verifier)?.current !== true;
}

export async function verifyPassword(password: string, verifier: string) {
  const parsed = parseVerifier(verifier);
  if (!parsed) return false;
  try {
    const actual = await deriveKey(
      password,
      parsed.salt,
      parsed.expected.length,
      parsed.profile,
    );
    return timingSafeEqual(actual, parsed.expected);
  } catch {
    return false;
  }
}
