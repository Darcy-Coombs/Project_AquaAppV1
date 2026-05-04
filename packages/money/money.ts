import { createEvent, type AquaEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';
import { DEFAULT_FIRE_TAX_RATE, fireAmount } from './fire.ts';
import { add, emptyBalanceState, round } from './balances.ts';

export type MoneyConfig = {
  fireTaxRate: number;
  weeklyAquaPerVerifiedHuman: number;
  earthTotal: number;
};

export const DEFAULT_MONEY_CONFIG: MoneyConfig = {
  earthTotal: 300_000_000_000_000,
  weeklyAquaPerVerifiedHuman: 480,
  fireTaxRate: DEFAULT_FIRE_TAX_RATE
};

export function createTransfer(keypair: KeyPair, to: string, amount: number, rate = DEFAULT_FIRE_TAX_RATE) {
  const fire = fireAmount(amount, rate);
  return createEvent({
    module: 'money',
    type: 'money.transfer',
    keypair,
    payload: {
      from: keypair.publicKey,
      to,
      amount,
      netAmount: round(amount - fire),
      fireAmount: fire,
      fireTaxRate: rate
    }
  });
}

export function staleMoneyEvent(keypair: KeyPair, staleEventId: string, reason: string) {
  return createEvent({
    module: 'money',
    type: 'money.stale',
    keypair,
    payload: { staleEventId, reason }
  });
}

export function deriveMoney(events: AquaEvent[]) {
  const state = emptyBalanceState();
  const staleIds = new Set<string>();

  for (const event of events) {
    if (event.module === 'money' && event.type === 'money.stale') staleIds.add(event.payload.staleEventId);
  }

  for (const event of events) {
    if (staleIds.has(event.id)) {
      state.stale.push(event);
      continue;
    }
    if (event.module === 'money') applyMoneyEvent(state, event);
    if (event.module === 'dex') applyDexMoneyEffect(state, event);
  }
  return state;
}

function applyMoneyEvent(state: ReturnType<typeof emptyBalanceState>, event: AquaEvent) {
  if (event.type === 'money.genesis') {
    state.earthReserve = event.payload.earthTotal;
  }
  if (event.type === 'money.issue_aqua') {
    add(state.aqua, event.payload.to, event.payload.amount);
  }
  if (event.type === 'money.transfer') {
    const from = event.payload.from ?? event.author;
    add(state.aqua, from, -event.payload.amount);
    add(state.aqua, event.payload.to, event.payload.netAmount);
    add(state.firePaid, from, event.payload.fireAmount);
    state.sump = round(state.sump + event.payload.fireAmount);
  }
}

function applyDexMoneyEffect(state: ReturnType<typeof emptyBalanceState>, event: AquaEvent) {
  if (event.type === 'dex.escrow_open') {
    add(state.aqua, event.payload.buyer, -event.payload.amount);
    add(state.locked, event.payload.buyer, event.payload.amount);
  }
  if (event.type === 'dex.escrow_release') {
    add(state.locked, event.payload.buyer, -event.payload.amount);
    add(state.aqua, event.payload.seller, event.payload.amount);
  }
  if (event.type === 'dex.escrow_refund') {
    add(state.locked, event.payload.buyer, -event.payload.amount);
    add(state.aqua, event.payload.buyer, event.payload.amount);
  }
  if (event.type === 'dex.voucher_pool_create') {
    add(state.aqua, event.payload.owner, -event.payload.amount);
    add(state.locked, event.payload.owner, event.payload.amount);
  }
}

export function canSpend(events: AquaEvent[], pubkey: string, amount: number): boolean {
  return (deriveMoney(events).aqua.get(pubkey) ?? 0) >= amount;
}
