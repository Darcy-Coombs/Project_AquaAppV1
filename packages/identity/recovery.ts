import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function recoveryNominate(keypair: KeyPair, guardians: string[]) {
  return createEvent({
    module: 'identity',
    type: 'identity.recovery_nominate',
    keypair,
    payload: { guardians }
  });
}

export function recoveryAccept(keypair: KeyPair, subject: string) {
  return createEvent({
    module: 'identity',
    type: 'identity.recovery_accept',
    keypair,
    payload: { subject }
  });
}
