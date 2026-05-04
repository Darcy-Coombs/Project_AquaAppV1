import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function publishOutcome(keypair: KeyPair, proposalId: string, tally: Record<string, number>, note = '') {
  return createEvent({
    module: 'governance',
    type: 'governance.outcome_publish',
    keypair,
    payload: { proposalId, tally, note }
  });
}
