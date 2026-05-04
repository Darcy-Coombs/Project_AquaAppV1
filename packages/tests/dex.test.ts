import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIdentityKeypair } from '../protocol/crypto.ts';
import { issueWeeklyAqua } from '../money/aqua.ts';
import { deriveMoney, createTransfer } from '../money/money.ts';
import { createQuote, activeQuotes } from '../dex/quotes.ts';
import { openEscrow, releaseEscrow, refundEscrow } from '../dex/escrow.ts';
import { witnessAttest } from '../dex/witnesses.ts';
import { createVoucherPool, mintVoucher } from '../dex/voucher-pools.ts';
import { dexState } from '../dex/index.ts';

test('quotes expire, escrows settle, witnesses and vouchers record', () => {
  const buyer = generateIdentityKeypair();
  const seller = generateIdentityKeypair();
  const events = [issueWeeklyAqua(buyer, buyer.publicKey, 480)];

  const quote = createQuote(seller, { side: 'sell', base: 'AQUA', quote: 'LOCAL', amount: 20, price: 1, expiresAt: Date.now() + 1000 });
  const expired = createQuote(seller, { side: 'sell', base: 'AQUA', quote: 'LOCAL', amount: 20, price: 1, expiresAt: Date.now() - 1 });
  events.push(quote, expired);
  assert.equal(activeQuotes(events).length, 1);

  const open = openEscrow(buyer, seller.publicKey, 20, quote.id);
  events.push(open);
  assert.equal(deriveMoney(events).locked.get(buyer.publicKey), 20);

  events.push(releaseEscrow(seller, open.id, buyer.publicKey, seller.publicKey, 20));
  assert.equal(deriveMoney(events).aqua.get(seller.publicKey), 20);

  const open2 = openEscrow(buyer, seller.publicKey, 10);
  events.push(open2, refundEscrow(seller, open2.id, buyer.publicKey, 10));
  assert.equal(deriveMoney(events).locked.get(buyer.publicKey), 0);

  events.push(witnessAttest(seller, open.id));
  events.push(createTransfer(buyer, seller.publicKey, 100));
  const pool = createVoucherPool(seller, 'room-a', 10);
  events.push(pool, mintVoucher(seller, 'room-a', buyer.publicKey, 10));
  const state = dexState(events);
  assert.equal(state.witnessAttestations.length, 1);
  assert.equal(state.vouchers.get('room-a').credits.get(buyer.publicKey), 10);
});
