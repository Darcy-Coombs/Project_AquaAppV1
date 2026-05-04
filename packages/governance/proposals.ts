import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function createProposal(keypair: KeyPair, title: string, body = '', choices = ['yes', 'no']) {
  return createEvent({
    module: 'governance',
    type: 'governance.proposal_create',
    keypair,
    payload: { title, body, choices }
  });
}

export function proposeProtocolUpgrade(keypair: KeyPair, targetProtocol: string, notes = '') {
  return createEvent({
    module: 'governance',
    type: 'governance.protocol_upgrade_propose',
    keypair,
    payload: { targetProtocol, notes, forkFriendly: true }
  });
}

export function acceptProtocolUpgrade(keypair: KeyPair, proposalId: string) {
  return createEvent({
    module: 'governance',
    type: 'governance.protocol_upgrade_accept',
    keypair,
    payload: { proposalId }
  });
}
