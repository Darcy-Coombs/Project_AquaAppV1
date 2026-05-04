import { createEvent, type AquaEvent } from '../protocol/event.ts';
import { sha256Hex, type KeyPair } from '../protocol/crypto.ts';

export function selectCommittee(keypair: KeyPair, members: string[], count: number, recentEvents: AquaEvent[]) {
  const selected = deterministicCommittee(members, count, recentEvents);
  return createEvent({
    module: 'governance',
    type: 'governance.committee_select',
    keypair,
    payload: { count, selected }
  });
}

export function deterministicCommittee(members: string[], count: number, recentEvents: AquaEvent[]): string[] {
  const seed = recentEvents.slice(-16).map((e) => e.id).join('|') || 'aqua-genesis-seed';
  return [...new Set(members)].sort((a, b) => {
    const ha = sha256Hex(`${seed}:${a}`);
    const hb = sha256Hex(`${seed}:${b}`);
    return ha.localeCompare(hb);
  }).slice(0, count);
}
