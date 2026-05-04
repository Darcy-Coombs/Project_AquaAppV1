import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function witnessAttest(keypair: KeyPair, subjectEventId: string, statement = 'off-chain condition observed') {
  return createEvent({
    module: 'dex',
    type: 'dex.witness_attest',
    keypair,
    payload: { subjectEventId, statement, bondedIdentity: keypair.publicKey, stub: true }
  });
}
