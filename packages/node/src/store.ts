import { replayEvents, applyConfirmedEvent, validateEnvelope, parsePayload, hashHex, type ReplayState, type AquaBundle, type AquaEvent, type RejectedEvent } from "@aqua/protocol";
import { ECONOMY_POLICY_ID, LEGACY_GENESIS_EARTH_SUPPLY } from "@aqua/shared";

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
  private cachedState?: ReplayState;
  private cachedVersion = -1;
  get economyPolicy(): string { return (this.db.prepare("SELECT value FROM alpha_meta WHERE key = 'economy_policy'").get() as {value:string}).value; }

  private validatedState(): ReplayState {
    const version = (this.db.prepare("PRAGMA data_version").get() as { data_version: number }).data_version;
    if (!this.cachedState || version !== this.cachedVersion) { this.cachedState = replayEvents(this.allEvents(), this.economyPolicy === ECONOMY_POLICY_ID ? {} : {genesisEarthSupply:LEGACY_GENESIS_EARTH_SUPPLY}); this.cachedVersion = version; }
    return this.cachedState;
  }

  private constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, event_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rejected_events (event_id TEXT, reason TEXT NOT NULL, event_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS peers (url TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dev_email_tokens (email_hash TEXT PRIMARY KEY, token TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS alpha_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    const count = (db.prepare("SELECT COUNT(*) AS count FROM events").get() as {count:number}).count;
    db.prepare("INSERT OR IGNORE INTO alpha_meta(key,value) VALUES ('economy_policy',?)").run(count ? "legacy-v1-unmigrated" : ECONOMY_POLICY_ID);
  }

  static async open(path = "aqua-node.sqlite"): Promise<SQLiteEventStore> {
    const sqlite = await import("node:sqlite") as unknown as { DatabaseSync: new (path: string) => DatabaseSync };
    return new SQLiteEventStore(new sqlite.DatabaseSync(path));
  }

  addEvent(event: AquaEvent): boolean {
    this.cachedState = undefined;
    const result = this.db.prepare("INSERT OR IGNORE INTO events(event_id, event_json, created_at) VALUES (?, ?, ?)").run(
      event.eventId,
      JSON.stringify(event),
      event.createdAt
    ) as { changes?: number };
    return (result.changes ?? 0) > 0;
  }

  /** One synchronous SQLite transaction is the alpha's ordering authority. Not distributed consensus. */
  acceptEvent(event: AquaEvent, now = Date.now(), publicTestVoting = false): boolean {
    validateEnvelope(event); parsePayload(event);
    if (this.economyPolicy !== ECONOMY_POLICY_ID) throw new Error("This is a legacy ledger. Export/retain it and use a new alpha-v2 database; no automatic monetary migration is allowed.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const before = this.validatedState();
      const existing = before.accepted;
      if (existing.some(item => item.eventId === event.eventId)) { this.db.exec("COMMIT"); return false; }
      if (Date.parse(event.createdAt) > now + 120000) throw new Error("Event timestamp is in the future");
      if (event.type === "money.ubi_claimed") {
        const date = new Date(now); const epoch = `${date.getUTCFullYear()}-w${Math.floor((now-Date.UTC(date.getUTCFullYear(),0,1))/(7*86400000))+1}`;
        if ((event.payload as { epoch: string }).epoch !== epoch) throw new Error("Only the authority's current UBI period can be claimed");
      }
      if (event.type.startsWith("governance.")) {
        if (!publicTestVoting) throw new Error("Public voting is disabled; start an explicit alpha testnet");
        if ((event.payload as {publicTestConsent?:boolean}).publicTestConsent !== true) throw new Error("Signed public test vote consent is required");
        const proposalId = (event.payload as { proposalId?: string }).proposalId;
        const priorProposal = proposalId ? before.proposals.get(proposalId) : undefined;
        if (event.type !== "governance.proposal_created" && priorProposal && now >= Date.parse(priorProposal.closesAt)) throw new Error("Voting is closed by authority time");
        if (event.type === "governance.proposal_created" && Date.parse((event.payload as { closesAt: string }).closesAt) <= now) throw new Error("Proposal closes in the past");
      }
      if (before.pending.length || before.rejected.length) throw new Error("Legacy ledger contains invalid or pending history; export it and start a fresh alpha database");
      const after = applyConfirmedEvent(before,event);
      const inserted = this.addEvent(event);
      this.db.exec("COMMIT"); this.cachedState = after; return inserted;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  ledgerSnapshot() {
    const state = this.validatedState(); const events = state.accepted;
    const wallets = [...state.wallets].map(([userId, wallet]) => ({ userId, ...Object.fromEntries(Object.entries(wallet).map(([key,value]) => [key,value.toString()])) }));
    const totalWallets = [...state.wallets.values()].reduce((total,wallet) => total+wallet.balance,0n);
    const totalReserves = [...state.pools.values()].reduce((total,pool) => total+pool.reserve,0n);
    return { mode: "alpha-testnet", finality: "single-authority", eventCount: events.length, head: hashHex(state.accepted.map(e => e.eventId)), earthRemaining: state.earthRemaining.toString(), sump: state.sump.toString(), circulatingAqua: totalWallets.toString(), lockedAqua: totalReserves.toString(), conservedTotal: (state.earthRemaining+state.sump+totalWallets+totalReserves).toString(), wallets, pending: state.pending.length, rejected: state.rejected.length, fundingAlerts: state.autoProposals };
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
