import { createEvent, type AquaEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function createQuote(keypair: KeyPair, input: {
  side: 'buy' | 'sell';
  base: string;
  quote: string;
  amount: number;
  price: number;
  expiresAt: number;
}) {
  return createEvent({
    module: 'dex',
    type: 'dex.quote_create',
    keypair,
    payload: { ...input, binding: false, note: 'signed speech until escrow opens' }
  });
}

export function cancelQuote(keypair: KeyPair, quoteId: string) {
  return createEvent({
    module: 'dex',
    type: 'dex.quote_cancel',
    keypair,
    payload: { quoteId }
  });
}

export function activeQuotes(events: AquaEvent[], now = Date.now()) {
  const cancelled = new Set<string>();
  const quotes = new Map<string, AquaEvent>();
  for (const event of events) {
    if (event.type === 'dex.quote_cancel') cancelled.add(event.payload.quoteId);
    if (event.type === 'dex.quote_create') quotes.set(event.id, event);
  }
  return [...quotes.values()].filter((q) => !cancelled.has(q.id) && q.payload.expiresAt > now);
}
