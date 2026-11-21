import { randomBytes } from "node:crypto";

const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
const identifierLength = 16;
const acceptedByteMaximum = Math.floor(256 / alphabet.length) * alphabet.length;

/** A concise, unambiguous identifier for a persisted Forman resource. */
export function createResourceId() {
  let identifier = "";

  while (identifier.length < identifierLength) {
    for (const byte of randomBytes(identifierLength)) {
      if (byte >= acceptedByteMaximum) continue;
      identifier += alphabet[byte % alphabet.length];
      if (identifier.length === identifierLength) return identifier;
    }
  }

  return identifier;
}
