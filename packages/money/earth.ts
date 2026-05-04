import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export const DEFAULT_EARTH_TOTAL = 300_000_000_000_000;

export function createGenesis(keypair: KeyPair, earthTotal = DEFAULT_EARTH_TOTAL) {
  return createEvent({
    module: 'money',
    type: 'money.genesis',
    keypair,
    payload: {
      earthTotal,
      reserve: 'earth-fixed-reserve',
      philosophy: 'earth is a fixed shared reserve created at genesis'
    }
  });
}
