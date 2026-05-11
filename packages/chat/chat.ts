import { createEvent, type AquaEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function createChatRoom(keypair: KeyPair, roomId: string, name = roomId, topic = '') {
  return createEvent({
    module: 'chat',
    type: 'chat.room_create',
    keypair,
    payload: { roomId, name, topic }
  });
}

export function createChatMessage(keypair: KeyPair, roomId: string, text: string) {
  return createEvent({
    module: 'chat',
    type: 'chat.message_create',
    keypair,
    payload: { roomId, text }
  });
}

export function chatState(events: AquaEvent[]) {
  const rooms = new Map<string, AquaEvent>();
  const messages = new Map<string, AquaEvent[]>();

  for (const event of events) {
    if (event.module !== 'chat') continue;
    if (event.type === 'chat.room_create') {
      rooms.set(event.payload.roomId, event);
      if (!messages.has(event.payload.roomId)) messages.set(event.payload.roomId, []);
    }
    if (event.type === 'chat.message_create' || event.type === 'chat.message_send') {
      if (!messages.has(event.payload.roomId)) messages.set(event.payload.roomId, []);
      messages.get(event.payload.roomId)!.push(event);
    }
  }

  return { rooms, messages };
}
