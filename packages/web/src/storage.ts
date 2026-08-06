import Dexie, { type Table } from "dexie";
import type { AquaEvent } from "@aqua/protocol";

export type StoredKey = {
  id: string;
  userId: string;
  publicKey: string;
  privateKey: string;
};

export class AquaDb extends Dexie {
  events!: Table<AquaEvent, string>;
  keys!: Table<StoredKey, string>;
  queue!: Table<AquaEvent, string>;

  constructor() {
    super("aqua-web-v1");
    this.version(1).stores({
      events: "eventId, createdAt, type, author",
      keys: "id, userId",
      queue: "eventId, createdAt"
    });
  }
}

export const db = new AquaDb();
