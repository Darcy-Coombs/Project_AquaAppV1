import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function castVote(keypair: KeyPair, proposalId: string, choice: string) {
  return createEvent({
    module: 'governance',
    type: 'governance.vote_cast',
    keypair,
    payload: { proposalId, choice }
  });
}
