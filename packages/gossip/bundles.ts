import { type AquaEvent } from '../protocol/event.ts';

export type EventBundle = {
  protocol: string;
  exportedAt: number;
  events: AquaEvent[];
};

export function exportBundle(events: AquaEvent[]): EventBundle {
  return {
    protocol: 'aqua.base.v0.1',
    exportedAt: Date.now(),
    events
  };
}

export function readBundle(input: any): AquaEvent[] {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.events)) return input.events;
  throw new Error('invalid bundle');
}
