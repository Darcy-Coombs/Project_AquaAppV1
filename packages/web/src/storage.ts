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

type SortDirection = "asc" | "desc";

class MemoryTable<T extends Record<string, unknown>> {
  private rows = new Map<string, T>();

  constructor(private readonly keyField: keyof T) {}

  async put(row: T): Promise<string> {
    const key = String(row[this.keyField]);
    this.rows.set(key, clone(row));
    return key;
  }

  async get(key: string): Promise<T | undefined> {
    const row = this.rows.get(key);
    return row ? clone(row) : undefined;
  }

  async delete(key: string): Promise<void> {
    this.rows.delete(key);
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.rows.values()).map(clone);
  }

  orderBy(field: keyof T) {
    const toArray = async (direction: SortDirection = "asc") => {
      const sorted = await this.toArray();
      sorted.sort((left, right) => {
        const a = String(left[field] ?? "");
        const b = String(right[field] ?? "");
        return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
      });
      return sorted;
    };
    return {
      toArray,
      reverse: () => ({ toArray: () => toArray("desc") })
    };
  }
}

class MemoryAquaDb {
  events = new MemoryTable<AquaEvent>("eventId");
  keys = new MemoryTable<StoredKey>("id");
  queue = new MemoryTable<AquaEvent>("eventId");
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : value;
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && globalThis.location?.protocol !== "file:";
}

export const db = canUseIndexedDb() ? new AquaDb() : new MemoryAquaDb();
