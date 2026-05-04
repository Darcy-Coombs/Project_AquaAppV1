import { KNOWN_MODULES } from './constants.ts';
import { type AquaEvent, verifyEvent } from './event.ts';

export type StoredEvent = {
  event: AquaEvent;
  valid: boolean;
  applied: boolean;
  stale: boolean;
  reason?: string;
};

export class EventDag {
  events = new Map<string, StoredEvent>();
  enabledModules: Set<string>;

  constructor(enabledModules = KNOWN_MODULES as readonly string[]) {
    this.enabledModules = new Set(enabledModules);
  }

  add(event: AquaEvent): StoredEvent {
    const existing = this.events.get(event.id);
    if (existing) return existing;

    const valid = verifyEvent(event);
    const known = this.enabledModules.has(event.module);
    const stored: StoredEvent = {
      event,
      valid,
      applied: valid && known,
      stale: false,
      reason: valid ? (known ? undefined : 'module-disabled-or-unknown') : 'invalid-signature-or-id'
    };
    this.events.set(event.id, stored);
    return stored;
  }

  all(): AquaEvent[] {
    return [...this.events.values()].map((s) => s.event).sort(compareEvents);
  }

  validApplied(): AquaEvent[] {
    return [...this.events.values()].filter((s) => s.valid && s.applied).map((s) => s.event).sort(compareEvents);
  }

  get(id: string): StoredEvent | undefined {
    return this.events.get(id);
  }

  ids(): string[] {
    return [...this.events.keys()].sort();
  }
}

export function compareEvents(a: AquaEvent, b: AquaEvent): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
