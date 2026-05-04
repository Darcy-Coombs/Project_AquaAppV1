import { type AquaEvent } from '../protocol/event.ts';

export type SyncStore = {
  ids(): string[];
  all(): AquaEvent[];
  addEvent(event: AquaEvent): boolean;
};

export function handleSyncMessage(store: SyncStore, msg: any, send: (msg: any) => void, rebroadcast?: (event: AquaEvent) => void) {
  if (msg.type === 'hello') {
    const mine = new Set(store.ids());
    const theirs = new Set(msg.ids ?? []);
    const missingForThem = store.all().filter((e) => !theirs.has(e.id));
    const missingForMe = [...theirs].filter((id) => !mine.has(id));
    if (missingForThem.length) send({ type: 'events', events: missingForThem });
    if (missingForMe.length) send({ type: 'get', ids: missingForMe });
  }
  if (msg.type === 'get') {
    const requested = new Set(msg.ids ?? []);
    send({ type: 'events', events: store.all().filter((e) => requested.has(e.id)) });
  }
  if (msg.type === 'events') {
    for (const event of msg.events ?? []) {
      if (store.addEvent(event)) rebroadcast?.(event);
    }
  }
}
