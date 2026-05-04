import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function sumpTopup(keypair: KeyPair, amount: number, sourceEventId: string) {
  return createEvent({
    module: 'money',
    type: 'money.sump_topup',
    keypair,
    payload: { amount, sourceEventId, purpose: 'future_ubi_after_earth_runway' }
  });
}
