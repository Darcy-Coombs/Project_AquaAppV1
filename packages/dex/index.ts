export * from './quotes.ts';
export * from './escrow.ts';
export * from './voucher-pools.ts';
export * from './witnesses.ts';

export function dexState(events: any[]) {
  const escrows = new Map();
  const vouchers = new Map();
  const witnessAttestations = [];
  for (const event of events) {
    if (event.type === 'dex.escrow_open') escrows.set(event.id, { ...event.payload, status: 'open', id: event.id });
    if (event.type === 'dex.escrow_release') {
      const escrow = escrows.get(event.payload.escrowId);
      if (escrow) escrow.status = 'released';
    }
    if (event.type === 'dex.escrow_refund') {
      const escrow = escrows.get(event.payload.escrowId);
      if (escrow) escrow.status = 'refunded';
    }
    if (event.type === 'dex.witness_attest') witnessAttestations.push(event);
    if (event.type === 'dex.voucher_pool_create') vouchers.set(event.payload.poolId, { locked: event.payload.amount, credits: new Map() });
    if (event.type === 'dex.voucher_mint') {
      const pool = vouchers.get(event.payload.poolId);
      if (pool) pool.credits.set(event.payload.to, (pool.credits.get(event.payload.to) ?? 0) + event.payload.amount);
    }
  }
  return { escrows, vouchers, witnessAttestations };
}
