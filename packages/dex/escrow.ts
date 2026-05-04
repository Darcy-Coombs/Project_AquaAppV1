import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function openEscrow(keypair: KeyPair, seller: string, amount: number, quoteId?: string) {
  return createEvent({
    module: 'dex',
    type: 'dex.escrow_open',
    keypair,
    payload: { buyer: keypair.publicKey, seller, amount, quoteId }
  });
}

export function releaseEscrow(keypair: KeyPair, escrowId: string, buyer: string, seller: string, amount: number) {
  return createEvent({
    module: 'dex',
    type: 'dex.escrow_release',
    keypair,
    payload: { escrowId, buyer, seller, amount }
  });
}

export function refundEscrow(keypair: KeyPair, escrowId: string, buyer: string, amount: number) {
  return createEvent({
    module: 'dex',
    type: 'dex.escrow_refund',
    keypair,
    payload: { escrowId, buyer, amount }
  });
}
