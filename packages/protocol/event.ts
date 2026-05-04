import { BASE_PROTOCOL, MODULE_VERSION } from './constants.ts';
import { canonicalJson } from './canonical-json.ts';
import { sha256Hex, signText, verifyText, type KeyPair } from './crypto.ts';

export type AquaEvent = {
  id: string;
  protocol: string;
  module: string;
  moduleVersion: string;
  type: string;
  createdAt: number;
  author: string;
  parents: string[];
  payload: Record<string, any>;
  signature: string;
};

export type UnsignedEvent = Omit<AquaEvent, 'id' | 'signature'>;

export function signingBody(event: Partial<AquaEvent>): UnsignedEvent {
  return {
    protocol: event.protocol ?? BASE_PROTOCOL,
    module: event.module ?? 'system',
    moduleVersion: event.moduleVersion ?? MODULE_VERSION,
    type: event.type ?? 'system.unknown',
    createdAt: event.createdAt ?? Date.now(),
    author: event.author ?? '',
    parents: event.parents ?? [],
    payload: event.payload ?? {}
  };
}

export function eventSigningText(event: Partial<AquaEvent>): string {
  return canonicalJson(signingBody(event));
}

export function eventIdFor(event: Partial<AquaEvent>): string {
  return sha256Hex(eventSigningText(event));
}

export function createEvent(input: {
  module: string;
  type: string;
  payload?: Record<string, any>;
  parents?: string[];
  keypair: KeyPair;
  createdAt?: number;
  protocol?: string;
  moduleVersion?: string;
}): AquaEvent {
  const body = signingBody({
    protocol: input.protocol ?? BASE_PROTOCOL,
    module: input.module,
    moduleVersion: input.moduleVersion ?? MODULE_VERSION,
    type: input.type,
    createdAt: input.createdAt ?? Date.now(),
    author: input.keypair.publicKey,
    parents: input.parents ?? [],
    payload: input.payload ?? {}
  });
  const text = canonicalJson(body);
  return {
    ...body,
    id: sha256Hex(text),
    signature: signText(input.keypair.privateKey, text)
  };
}

export function verifyEvent(event: AquaEvent): boolean {
  if (event.id !== eventIdFor(event)) return false;
  if (!Array.isArray(event.parents) || event.parents.length > 2) return false;
  return verifyText(event.author, eventSigningText(event), event.signature);
}
