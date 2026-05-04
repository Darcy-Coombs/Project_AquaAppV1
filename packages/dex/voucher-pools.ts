import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function createVoucherPool(keypair: KeyPair, poolId: string, amount: number, room = 'local-room') {
  return createEvent({
    module: 'dex',
    type: 'dex.voucher_pool_create',
    keypair,
    payload: { poolId, owner: keypair.publicKey, amount, room, ratio: '1:1 Aqua locked to room credit' }
  });
}

export function mintVoucher(keypair: KeyPair, poolId: string, to: string, amount: number) {
  return createEvent({
    module: 'dex',
    type: 'dex.voucher_mint',
    keypair,
    payload: { poolId, to, amount }
  });
}

export function burnVoucher(keypair: KeyPair, poolId: string, owner: string, amount: number) {
  return createEvent({
    module: 'dex',
    type: 'dex.voucher_burn',
    keypair,
    payload: { poolId, owner, amount }
  });
}

export function redeemVoucher(keypair: KeyPair, poolId: string, owner: string, amount: number) {
  return createEvent({
    module: 'dex',
    type: 'dex.voucher_redeem',
    keypair,
    payload: { poolId, owner, amount }
  });
}
