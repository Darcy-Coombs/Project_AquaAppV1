import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { AquaEvent, UnsignedAquaEvent } from "./types.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): Json {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite numbers are not canonical JSON");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object") {
    const result: Record<string, Json> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const next = (value as Record<string, unknown>)[key];
      if (next !== undefined) result[key] = sortValue(next);
    }
    return result;
  }
  throw new Error(`Unsupported canonical value: ${typeof value}`);
}

export function eventSigningContent(event: UnsignedAquaEvent | AquaEvent): UnsignedAquaEvent {
  const { type, version, createdAt, author, publicKey, parents, payload } = event;
  return { type, version, createdAt, author, publicKey, parents: [...parents].sort(), payload };
}

export function hashHex(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalize(value))));
}

export function eventIdFor(event: UnsignedAquaEvent | AquaEvent): string {
  return hashHex(eventSigningContent(event));
}

export function createKeyPair(seedHex?: string): { privateKey: string; publicKey: string } {
  const privateBytes = seedHex ? hexToBytes(seedHex) : ed25519.utils.randomPrivateKey();
  return {
    privateKey: bytesToHex(privateBytes),
    publicKey: bytesToHex(ed25519.getPublicKey(privateBytes))
  };
}

export function signContent(privateKeyHex: string, content: unknown): string {
  return bytesToHex(ed25519.sign(sha256(utf8ToBytes(canonicalize(content))), hexToBytes(privateKeyHex)));
}

export function verifyContent(publicKeyHex: string, signatureHex: string, content: unknown): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), sha256(utf8ToBytes(canonicalize(content))), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

export function signEvent(privateKeyHex: string, event: UnsignedAquaEvent): AquaEvent {
  const content = eventSigningContent(event);
  const eventId = eventIdFor(content);
  return { ...content, eventId, signature: signContent(privateKeyHex, content) };
}

export function verifyEventSignature(event: AquaEvent): boolean {
  return event.eventId === eventIdFor(event) && verifyContent(event.publicKey, event.signature, eventSigningContent(event));
}
