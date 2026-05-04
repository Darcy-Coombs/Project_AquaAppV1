import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export const DEFAULT_FIRE_TAX_RATE = 0.04;

export function fireAmount(amount: number, rate = DEFAULT_FIRE_TAX_RATE): number {
  return Math.round(amount * rate * 1_000_000) / 1_000_000;
}

export function fireCollect(keypair: KeyPair, from: string, amount: number, transferId: string) {
  return createEvent({
    module: 'money',
    type: 'money.fire_collect',
    keypair,
    payload: { from, amount, transferId }
  });
}
