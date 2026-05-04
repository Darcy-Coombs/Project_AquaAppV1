import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createEvent, type AquaEvent } from '../protocol/event.ts';
import { generateIdentityKeypair, type KeyPair } from '../protocol/crypto.ts';

export type PohwStatus = 'unverified' | 'locally_verified' | 'vouched' | 'challenged' | 'archived';

export function loadOrCreateKeypair(path: string): KeyPair {
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  mkdirSync(dirname(path), { recursive: true });
  const keypair = generateIdentityKeypair();
  writeFileSync(path, JSON.stringify(keypair, null, 2));
  return keypair;
}

export function createIdentityClaim(keypair: KeyPair, name = 'local-human'): AquaEvent {
  return createEvent({
    module: 'identity',
    type: 'identity.claim',
    keypair,
    payload: {
      name,
      privacy: 'no private personal data on ledger'
    }
  });
}

export function createPohwAttest(keypair: KeyPair, subject: string, status: PohwStatus = 'unverified'): AquaEvent {
  return createEvent({
    module: 'identity',
    type: 'identity.pohw_attest',
    keypair,
    payload: {
      subject,
      status,
      method: 'prototype-local-attestation',
      biometricData: false
    }
  });
}

export function createKeyRotation(keypair: KeyPair, nextPublicKey: string): AquaEvent {
  return createEvent({
    module: 'identity',
    type: 'identity.key_rotate',
    keypair,
    payload: { previousPublicKey: keypair.publicKey, nextPublicKey }
  });
}

export function createRecoveryStub(keypair: KeyPair, subject: string): AquaEvent {
  return createEvent({
    module: 'identity',
    type: 'identity.recovery_stub',
    keypair,
    payload: { subject, status: 'stub' }
  });
}

export function identityState(events: AquaEvent[]) {
  const claims = new Map<string, AquaEvent>();
  const pohw = new Map<string, PohwStatus>();

  for (const event of events) {
    if (event.module !== 'identity') continue;
    if (event.type === 'identity.claim') {
      claims.set(event.author, event);
      if (!pohw.has(event.author)) pohw.set(event.author, 'unverified');
    }
    if (event.type === 'identity.pohw_attest') {
      const subject = event.payload.subject ?? event.author;
      pohw.set(subject, event.payload.status);
    }
  }

  const verified = [...pohw.entries()]
    .filter(([, status]) => status === 'locally_verified' || status === 'vouched')
    .map(([pubkey]) => pubkey)
    .sort();

  return { claims, pohw, verified };
}
