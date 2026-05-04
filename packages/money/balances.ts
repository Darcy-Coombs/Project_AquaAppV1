import { type AquaEvent } from '../protocol/event.ts';

export type BalanceState = {
  earthReserve: number;
  aqua: Map<string, number>;
  firePaid: Map<string, number>;
  sump: number;
  locked: Map<string, number>;
  stale: AquaEvent[];
};

export function emptyBalanceState(): BalanceState {
  return {
    earthReserve: 0,
    aqua: new Map(),
    firePaid: new Map(),
    sump: 0,
    locked: new Map(),
    stale: []
  };
}

export function getBalance(state: BalanceState, pubkey: string) {
  return {
    pubkey,
    aqua: round(state.aqua.get(pubkey) ?? 0),
    locked: round(state.locked.get(pubkey) ?? 0),
    firePaid: round(state.firePaid.get(pubkey) ?? 0),
    sump: round(state.sump),
    earthReserve: round(state.earthReserve)
  };
}

export function add(map: Map<string, number>, key: string, amount: number) {
  map.set(key, round((map.get(key) ?? 0) + amount));
}

export function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
