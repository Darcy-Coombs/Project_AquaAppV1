import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export const DEFAULT_WEEKLY_AQUA = 480;

export function issueWeeklyAqua(keypair: KeyPair, to: string, amount = DEFAULT_WEEKLY_AQUA) {
  return createEvent({
    module: 'money',
    type: 'money.issue_aqua',
    keypair,
    payload: { to, amount, reason: 'weekly_verified_human_issuance', betaDev: true }
  });
}
