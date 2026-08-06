import type { AquaBundle, AquaEvent, RejectedEvent } from "@aqua/protocol";

type DatabaseSync = {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
};

export class SQLiteEventStore {
  private db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, event_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rejected_events (event_id TEXT, reason TEXT NOT NULL, event_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS peers (url TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dev_email_tokens (email_hash TEXT PRIMARY KEY, token TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
  }

  static async open(path = "aqua-node.sqlite"): Promise<SQLiteEventStore> {
    const sqlite = await import("node:sqlite") as unknown as { DatabaseSync: new (path: string) => DatabaseSync };
    return new SQLiteEventStore(new sqlite.DatabaseSync(path));
  }

  addEvent(event: AquaEvent): boolean {
    const result = this.db.prepare("INSERT OR IGNORE INTO events(event_id, event_json, created_at) VALUES (?, ?, ?)").run(
      event.eventId,
      JSON.stringify(event),
      event.createdAt
    ) as { changes?: number };
    return (result.changes ?? 0) > 0;
  }

  allEvents(): AquaEvent[] {
    return this.db.prepare("SELECT event_json FROM events ORDER BY created_at, event_id").all()
      .map((row) => JSON.parse((row as { event_json: string }).event_json) as AquaEvent);
  }

  addRejected(rejected: RejectedEvent): void {
    this.db.prepare("INSERT INTO rejected_events(event_id, reason, event_json) VALUES (?, ?, ?)").run(
      rejected.event.eventId,
      rejected.reason,
      JSON.stringify(rejected.event)
    );
  }

  issueEmailToken(emailHash: string): string {
    const token = crypto.randomUUID();
    this.db.prepare("INSERT OR REPLACE INTO dev_email_tokens(email_hash, token, created_at) VALUES (?, ?, ?)").run(
      emailHash,
      token,
      new Date().toISOString()
    );
    return token;
  }

  devInbox(): unknown[] {
    return this.db.prepare("SELECT email_hash, token, created_at FROM dev_email_tokens ORDER BY created_at DESC").all();
  }

  exportBundle(sourceNodeId: string): AquaBundle {
    return { bundleVersion: 1, createdAt: new Date().toISOString(), sourceNodeId, events: this.allEvents() };
  }

  close(): void {
    this.db.close();
  }
}
