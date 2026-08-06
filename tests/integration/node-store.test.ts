import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvent, createKeyPair, exportBundle, importBundle, replayEvents } from "../../packages/protocol/src/index.js";
import { SQLiteEventStore } from "../../packages/node/src/store.js";

describe("node SQLite store and bundles", () => {
  it("persists events and imports valid bundles idempotently", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aqua-node-"));
    try {
      const dbPath = join(dir, "node.sqlite");
      const key = createKeyPair("04".repeat(32));
      const event = createEvent({
        type: "identity.created",
        author: "dana",
        publicKey: key.publicKey,
        privateKey: key.privateKey,
        payload: { userId: "dana", verificationLevel: "email" }
      });
      const store = await SQLiteEventStore.open(dbPath);
      expect(store.addEvent(event)).toBe(true);
      expect(store.addEvent(event)).toBe(false);
      store.close();
      const reopened = await SQLiteEventStore.open(dbPath);
      expect(reopened.allEvents()).toHaveLength(1);
      const bundle = exportBundle("test", [event]);
      const imported = importBundle([], bundle);
      expect(imported.acceptedCount).toBe(1);
      expect(replayEvents(imported.events).accepted).toHaveLength(1);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
