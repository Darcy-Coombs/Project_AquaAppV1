import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createEvent,
  createKeyPair,
  exportBundle,
  hashHex,
  importBundle,
  replayEvents,
  tallyProposal,
  type AquaBundle,
  type AquaEvent
} from "@aqua/protocol";
import { FIELDKIT_VERSION, aqua, assertProductionSafe, formatAqua, loadConfig } from "@aqua/shared";
import { db, type StoredKey } from "./storage.js";
import "./styles.css";

const config = loadConfig({
  mode: import.meta.env.MODE === "production" ? "production" : "development",
  betaOverrideEnabled: import.meta.env.MODE !== "production",
  nodeUrl: import.meta.env.VITE_AQUA_NODE_URL || undefined
});
assertProductionSafe(config);

const PRIMARY_NODE_KEY = "aqua-primary-node-url";
const KNOWN_NODES_KEY = "aqua-node-urls";

type Tab = "dashboard" | "identity" | "wallet" | "chat" | "governance" | "dex" | "sync" | "export" | "settings" | "dev";
type NodeProbe = { url: string; online: boolean; eventCount: number; latencyMs?: number; error?: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function App() {
  const [events, setEvents] = useState<AquaEvent[]>([]);
  const [key, setKey] = useState<StoredKey | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sync, setSync] = useState("offline-ready");
  const [runStatus, setRunStatus] = useState("idle");
  const [running, setRunning] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [nodes, setNodes] = useState<NodeProbe[]>([]);
  const [nodeUrl, setNodeUrl] = useState(initialNodeUrl);
  const [nodeUrlDraft, setNodeUrlDraft] = useState(initialNodeUrl);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installStatus, setInstallStatus] = useState("ready for mobile install");
  const state = useMemo(() => replayEvents(events), [events]);

  useEffect(() => {
    void refresh();
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("./sw.js");
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstallStatus("install available");
    };
    const onInstalled = () => setInstallStatus("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function refresh() {
    setEvents(await db.events.orderBy("createdAt").toArray());
    setKey((await db.keys.toArray())[0] ?? null);
    setQueueCount(await db.queue.count());
  }

  async function commit(event: AquaEvent) {
    await db.events.put(event);
    try {
      await fetch(`${nodeUrl}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
      setSync("synced");
    } catch {
      await db.queue.put(event);
      setSync("queued-offline");
    }
    await refresh();
  }

  async function submitOrQueue(event: AquaEvent, silent = false) {
    const targetUrl = nodes.find((node) => node.online)?.url ?? nodeUrl;
    try {
      await postEvent(targetUrl, event);
      if (!silent) setSync("synced");
    } catch {
      await db.queue.put(event);
      if (!silent) setSync("queued-offline");
    }
  }

  async function runProtocol() {
    if (running) return;
    setRunning(true);
    setRunStatus("running");
    try {
      let localEvents = await db.events.orderBy("createdAt").toArray();
      let activeKey = key ?? await db.keys.get("primary");
      if (!activeKey) {
        const pair = createKeyPair();
        const userId = `runner-${pair.publicKey.slice(0, 12)}`;
        activeKey = { id: "primary", userId, publicKey: pair.publicKey, privateKey: pair.privateKey };
        await db.keys.put(activeKey);
        const created = createEvent({
          type: "identity.created",
          author: userId,
          publicKey: pair.publicKey,
          privateKey: pair.privateKey,
          parents: lastParents(localEvents),
          payload: { userId, emailHash: hashHex(`${userId}@local.test`), verificationLevel: "email" }
        });
        localEvents = await appendRunEvent(localEvents, created);
      }

      let runState = replayEvents(localEvents);
      const identity = runState.identities.get(activeKey.userId);
      if (!identity || (identity.level !== "pohw_lite" && identity.level !== "beta_override")) {
        const method = config.betaOverrideEnabled ? "BETAoverride" : "pohw_lite";
        const verifiedEvent = createEvent({
          type: "identity.verified",
          author: activeKey.userId,
          publicKey: activeKey.publicKey,
          privateKey: activeKey.privateKey,
          parents: lastParents(localEvents),
          payload: {
            userId: activeKey.userId,
            method,
            proofHash: hashHex({ method, challenge: "run-button", userId: activeKey.userId }),
            verification_method: method
          }
        });
        localEvents = await appendRunEvent(localEvents, verifiedEvent);
      }

      runState = replayEvents(localEvents);
      if (!runState.ubiClaims.has(`${activeKey.userId}:${epoch()}`)) {
        const level = runState.identities.get(activeKey.userId)?.level;
        const method = level === "beta_override" ? "BETAoverride" : "pohw_lite";
        localEvents = await appendRunEvent(localEvents, createEvent({
          type: "money.ubi_claimed",
          author: activeKey.userId,
          publicKey: activeKey.publicKey,
          privateKey: activeKey.privateKey,
          parents: lastParents(localEvents),
          payload: { userId: activeKey.userId, epoch: epoch(), verification_method: method }
        }));
      }

      runState = replayEvents(localEvents);
      if (!runState.rooms.has("run-room")) {
        localEvents = await appendRunEvent(localEvents, createEvent({
          type: "chat.room_created",
          author: activeKey.userId,
          publicKey: activeKey.publicKey,
          privateKey: activeKey.privateKey,
          parents: lastParents(localEvents),
          payload: { roomId: "run-room", name: "Run Room", inviteCodeHash: hashHex("run-invite"), creator: activeKey.userId }
        }));
      }

      runState = replayEvents(localEvents);
      if (!runState.proposals.has("run-proposal")) {
        localEvents = await appendRunEvent(localEvents, createEvent({
          type: "governance.proposal_created",
          author: activeKey.userId,
          publicKey: activeKey.publicKey,
          privateKey: activeKey.privateKey,
          parents: lastParents(localEvents),
          payload: { proposalId: "run-proposal", title: "Run proposal", body: "Created by the Run button", closesAt: new Date(Date.now() + 86400000).toISOString() }
        }));
      }

      await refresh();
      setTab("dashboard");
      setRunStatus("run-complete");

      async function appendRunEvent(currentEvents: AquaEvent[], event: AquaEvent) {
        await db.events.put(event);
        void submitOrQueue(event, true);
        return [...currentEvents, event];
      }
    } finally {
      setRunning(false);
    }
  }

  async function makeIdentity() {
    const pair = createKeyPair();
    const userId = `user-${pair.publicKey.slice(0, 12)}`;
    const email = (document.querySelector<HTMLInputElement>("#email")?.value || `${userId}@local.test`).trim().toLowerCase();
    const emailHash = hashHex(email);
    const created = createEvent({
      type: "identity.created",
      author: userId,
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      payload: { userId, emailHash, verificationLevel: "email" }
    });
    await db.keys.put({ id: "primary", userId, publicKey: pair.publicKey, privateKey: pair.privateKey });
    await fetch(`${nodeUrl}/dev/email-token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emailHash }) }).catch(() => undefined);
    await commit(created);
  }

  async function verified(method: "BETAoverride" | "pohw_lite") {
    const activeKey = key ?? await db.keys.get("primary");
    if (!activeKey) return;
    const event = createEvent({
      type: "identity.verified",
      author: activeKey.userId,
      publicKey: activeKey.publicKey,
      privateKey: activeKey.privateKey,
      parents: lastParents(events),
      payload: {
        userId: activeKey.userId,
        method,
        proofHash: hashHex({ method, challenge: "local-human-proof", userId: activeKey.userId }),
        verification_method: method
      }
    });
    await commit(event);
  }

  async function claimUbi() {
    const activeKey = key ?? await db.keys.get("primary");
    if (!activeKey) return;
    const identity = state.identities.get(activeKey.userId);
    const method = identity?.level === "beta_override" ? "BETAoverride" : "pohw_lite";
    await commit(createEvent({
      type: "money.ubi_claimed",
      author: activeKey.userId,
      publicKey: activeKey.publicKey,
      privateKey: activeKey.privateKey,
      parents: lastParents(events),
      payload: { userId: activeKey.userId, epoch: epoch(), verification_method: method }
    }));
  }

  async function transfer() {
    if (!key) return;
    const to = document.querySelector<HTMLInputElement>("#send-to")?.value || "bob";
    const amount = aqua(Number(document.querySelector<HTMLInputElement>("#send-amount")?.value || 100));
    await commit(createEvent({
      type: "money.transfer",
      author: key.userId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      parents: lastParents(events),
      payload: { from: key.userId, to, amountMinor: amount.toString() }
    }));
  }

  async function createRoom() {
    if (!key) return;
    const roomId = document.querySelector<HTMLInputElement>("#room-id")?.value || "melbourne-test";
    await commit(createEvent({
      type: "chat.room_created",
      author: key.userId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      parents: lastParents(events),
      payload: { roomId, name: roomId, inviteCodeHash: hashHex("invite"), creator: key.userId }
    }));
  }

  async function joinRoom() {
    if (!key) return;
    const roomId = document.querySelector<HTMLInputElement>("#room-id")?.value || "melbourne-test";
    await commit(createEvent({
      type: "chat.member_joined",
      author: key.userId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      parents: lastParents(events),
      payload: { roomId, userId: key.userId, inviteCodeHash: hashHex("invite") }
    }));
  }

  async function createProposal() {
    if (!key) return;
    await commit(createEvent({
      type: "governance.proposal_created",
      author: key.userId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      parents: lastParents(events),
      payload: { proposalId: "test-proposal", title: "Test proposal", body: "Protocol smoke test", closesAt: new Date(Date.now() + 86400000).toISOString() }
    }));
  }

  async function vote(choice: "yes" | "no" | "abstain") {
    if (!key) return;
    await commit(createEvent({
      type: "governance.vote_cast",
      author: key.userId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      parents: lastParents(events),
      payload: { proposalId: "test-proposal", voter: key.userId, choice }
    }));
  }

  async function createPool() {
    if (!key) return;
    await commit(createEvent({
      type: "dex.pool_created",
      author: key.userId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      parents: lastParents(events),
      payload: { poolId: "pool-melbourne", roomId: "melbourne-test", maintainer: key.userId }
    }));
  }

  async function poolAction(type: "dex.pool_deposit" | "dex.pool_mint_room_credit") {
    if (!key) return;
    await commit(createEvent({
      type,
      author: key.userId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      parents: lastParents(events),
      payload: { poolId: "pool-melbourne", roomId: "melbourne-test", userId: key.userId, amountMinor: aqua(50).toString() }
    }));
  }

  async function syncNow() {
    const activeKey = key ?? await db.keys.get("primary");
    setSync(activeKey ? `scanning nodes for ${activeKey.userId}` : "scanning nodes for local guest");
    const probes = await scanLocalNodes();
    const onlineNode = probes.find((node) => node.online);
    if (!onlineNode) {
      setSync(activeKey ? `offline: queued for ${activeKey.userId}` : "offline: no active user");
      await refresh();
      return;
    }

    try {
      const queued = await db.queue.toArray();
      let pushed = 0;
      let pushRejected = 0;
      for (const event of queued) {
        try {
          await postEvent(onlineNode.url, event);
          await db.queue.delete(event.eventId);
          pushed += 1;
        } catch {
          pushRejected += 1;
        }
      }
      const remote = await fetch(`${onlineNode.url}/events`).then((response) => response.json()) as { events: AquaEvent[] };
      const local = await db.events.orderBy("createdAt").toArray();
      const merged = importBundle(local, {
        bundleVersion: 1,
        createdAt: new Date().toISOString(),
        sourceNodeId: onlineNode.url,
        events: remote.events
      });
      for (const event of merged.events) await db.events.put(event);
      setLastSyncAt(new Date().toLocaleTimeString());
      setSync(`${activeKey?.userId ?? "guest"} synced via ${onlineNode.url}: pushed ${pushed}, merged ${merged.acceptedCount}, rejected ${merged.rejected.length + pushRejected}`);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      setSync(activeKey ? `sync failed for ${activeKey.userId}: ${message}` : `sync failed: ${message}`);
    }
  }

  async function scanLocalNodes() {
    const probes = await Promise.all(nodeCandidates(nodeUrl).map(probeNode));
    setNodes(probes);
    return probes;
  }

  function saveNodeUrl() {
    const normalized = nodeUrlDraft.trim().replace(/\/$/, "");
    if (!normalized) return;
    const saved = nodeCandidates(normalized);
    localStorage.setItem(PRIMARY_NODE_KEY, normalized);
    localStorage.setItem(KNOWN_NODES_KEY, saved.join(","));
    setNodeUrl(normalized);
    setNodeUrlDraft(normalized);
    setNodes(saved.map((url): NodeProbe => ({ url, online: false, eventCount: 0 })));
    setSync(`node set to ${normalized}`);
  }

  async function exportData() {
    const bundle = exportBundle("browser", events);
    await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setSync("bundle-copied");
  }

  async function importData() {
    const raw = document.querySelector<HTMLTextAreaElement>("#bundle")?.value;
    if (!raw) return;
    const result = importBundle(events, JSON.parse(raw) as AquaBundle);
    for (const event of result.events) await db.events.put(event);
    setSync(`imported ${result.acceptedCount}, rejected ${result.rejected.length}`);
    await refresh();
  }

  async function installMobileApp() {
    if (!installPrompt) {
      setInstallStatus("use browser Install app or Add to Home Screen");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallStatus(choice.outcome === "accepted" ? "installed" : "install dismissed");
    setInstallPrompt(null);
  }

  const identity = key ? state.identities.get(key.userId) : undefined;
  const wallet = key ? state.wallets.get(key.userId) : undefined;
  const tally = tallyProposal(state, "test-proposal");
  const activeUserId = key?.userId ?? "guest";
  const activeUserEvents = key ? events.filter((event) => event.author === key.userId).length : 0;
  const onlineNodes = nodes.filter((node) => node.online).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local-first civic protocol</p>
          <h1>Project Aqua</h1>
        </div>
        <div className="header-actions">
          <button className="run-button" data-testid="run-button" onClick={runProtocol} disabled={running}>{running ? "Running" : "Run"}</button>
          <div className="status-pill" data-testid="identity-level">{identity?.level ?? "guest"}</div>
          {identity?.level === "beta_override" && <strong className="beta">BETA override verified</strong>}
        </div>
      </header>
      <div className="layout">
        <nav className="side-nav">{(["dashboard", "identity", "wallet", "chat", "governance", "dex", "sync", "export", "settings", ...(config.betaOverrideEnabled ? ["dev"] : [])] as Tab[]).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <div className="content">
      {tab === "dashboard" && <section className="panel dashboard-panel">
        <div className="section-heading">
          <p className="eyebrow">Dashboard</p>
          <h2>Local State</h2>
        </div>
        <div className="metric-grid">
          <article className="metric-card primary-metric"><span>Aqua balance</span><strong data-testid="balance">{formatAqua(wallet?.balance ?? 0n)}</strong></article>
          <article className="metric-card"><span>Active user</span><strong>{activeUserId}</strong></article>
          <article className="metric-card"><span>Fire paid</span><strong>{formatAqua(wallet?.firePaid ?? 0n)}</strong></article>
          <article className="metric-card"><span>Sump local</span><strong>{formatAqua(state.sump)}</strong></article>
          <article className="metric-card"><span>Queued</span><strong>{queueCount}</strong></article>
          <article className="metric-card"><span>Nodes online</span><strong data-testid="online-node-count">{onlineNodes}</strong></article>
        </div>
        <div className="action-row">
          <button className="run-button secondary-run" onClick={runProtocol} disabled={running}>{running ? "Running" : "Run"}</button>
          <button onClick={claimUbi}>Claim weekly UBI</button>
          <button className="ghost-button" onClick={syncNow}>Sync now</button>
        </div>
        <p className="sync-line" data-testid="run-status">Run {runStatus}</p>
        <p className="sync-line">Sync {sync}</p>
      </section>}
      {tab === "identity" && <section className="panel form-panel">
        <div className="section-heading"><p className="eyebrow">Identity</p><h2>Active Citizen</h2></div>
        <input id="email" placeholder="email" />
        <div className="action-row">
          <button onClick={makeIdentity}>Create email identity</button>
          <button onClick={() => verified("pohw_lite")}>PoHW-lite challenge</button>
          {config.betaOverrideEnabled && <button data-testid="beta-verify" onClick={() => verified("BETAoverride")}>BETAoverride verify</button>}
        </div>
      </section>}
      {tab === "wallet" && <section className="panel form-panel">
        <div className="section-heading"><p className="eyebrow">Wallet</p><h2>Aqua Transfer</h2></div>
        <input id="send-to" placeholder="recipient user id" />
        <input id="send-amount" type="number" placeholder="100" />
        <p>Fire tax is shown before send: 4% to Sump.</p>
        <button onClick={transfer}>Send Aqua</button>
      </section>}
      {tab === "chat" && <section className="panel form-panel">
        <div className="section-heading"><p className="eyebrow">Rooms</p><h2>Chaos Chat</h2></div>
        <input id="room-id" placeholder="melbourne-test" />
        <div className="action-row"><button onClick={createRoom}>Create room</button><button onClick={joinRoom}>Join room</button></div>
        <p className="sync-line">Rooms {state.rooms.size}</p>
      </section>}
      {tab === "governance" && <section className="panel form-panel">
        <div className="section-heading"><p className="eyebrow">Governance</p><h2>Proposal Tally</h2></div>
        <div className="action-row"><button onClick={createProposal}>Create proposal</button><button onClick={() => vote("yes")}>Vote yes</button><button onClick={() => vote("no")}>Vote no</button></div>
        <p className="tally" data-testid="tally">yes {tally.yes} no {tally.no} abstain {tally.abstain}</p>
      </section>}
      {tab === "dex" && <section className="panel form-panel">
        <div className="section-heading"><p className="eyebrow">DEX</p><h2>Voucher Pools</h2></div>
        <div className="action-row"><button onClick={createPool}>Create pool</button><button onClick={() => poolAction("dex.pool_deposit")}>Lock 50 Aqua</button><button onClick={() => poolAction("dex.pool_mint_room_credit")}>Mint 50 credits</button></div>
        <p className="sync-line">Pools {state.pools.size}</p>
      </section>}
      {tab === "sync" && <section className="panel sync-panel">
        <div className="section-heading"><p className="eyebrow">Sync</p><h2>Local Nodes</h2></div>
        <div className="metric-grid">
          <article className="metric-card"><span>Active user</span><strong data-testid="sync-active-user">{activeUserId}</strong></article>
          <article className="metric-card"><span>User events</span><strong>{activeUserEvents}</strong></article>
          <article className="metric-card"><span>Queued events</span><strong>{queueCount}</strong></article>
          <article className="metric-card"><span>Last sync</span><strong>{lastSyncAt ?? "never"}</strong></article>
        </div>
        <div className="action-row"><button onClick={scanLocalNodes}>Find local nodes</button><button onClick={syncNow}>Sync now</button></div>
        <div className="node-list" data-testid="node-list">
          {(nodes.length ? nodes : nodeCandidates(nodeUrl).map((url): NodeProbe => ({ url, online: false, eventCount: 0 }))).map((node) => (
            <article className={node.online ? "node-card online" : "node-card"} key={node.url}>
              <span>{node.online ? "online" : "unknown"}</span>
              <strong>{node.url}</strong>
              <small>{node.online ? `${node.eventCount} remote events${node.latencyMs ? ` in ${node.latencyMs}ms` : ""}` : node.error ?? "not scanned"}</small>
            </article>
          ))}
        </div>
        <p className="sync-line" data-testid="sync-status">{sync}</p>
      </section>}
      {tab === "export" && <section className="panel form-panel"><div className="section-heading"><p className="eyebrow">Bundles</p><h2>Import / Export</h2></div><button onClick={exportData}>Copy public bundle</button><textarea id="bundle" /><button onClick={importData}>Import bundle</button></section>}
      {tab === "settings" && <section className="panel form-panel">
        <div className="section-heading"><p className="eyebrow">Settings</p><h2>Runtime</h2></div>
        <div className="install-card">
          <img src="./icon.svg" alt="" />
          <div>
            <strong>Mobile download</strong>
            <p>Install Aqua Fieldkit v{FIELDKIT_VERSION} to your phone home screen. The app shell works offline after first load.</p>
            <button data-testid="install-app" onClick={installMobileApp}>{installPrompt ? "Install app" : "How to install"}</button>
            <small data-testid="install-status">{installStatus}</small>
          </div>
        </div>
        <label className="field-label" htmlFor="node-url">Relay node URL</label>
        <div className="node-url-row">
          <input id="node-url" value={nodeUrlDraft} onChange={(event) => setNodeUrlDraft(event.currentTarget.value)} />
          <button onClick={saveNodeUrl}>Save node URL</button>
        </div>
        <p className="sync-line">For phone LAN testing, use the node URL printed by <code>PHONE_TEST_AQUA.cmd</code>.</p>
        <p>Fieldkit version {FIELDKIT_VERSION}</p>
        <p>Node {nodeUrl}</p>
        <p>Public exports never include private keys. Encrypted backup extension point is reserved here.</p>
      </section>}
      {tab === "dev" && <section className="panel form-panel"><div className="section-heading"><p className="eyebrow">Development</p><h2>Dev Panel</h2></div><p>BETAoverride enabled: {String(config.betaOverrideEnabled)}</p><p>Proxy debug is dev-only.</p></section>}
        </div>
      </div>
      <footer>{state.accepted.length} accepted | {state.pending.length} pending | {state.rejected.length} rejected</footer>
    </main>
  );
}

function lastParents(events: AquaEvent[]): string[] {
  return events.slice(-2).map((event) => event.eventId);
}

function epoch(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return `${now.getUTCFullYear()}-w${Math.floor((now.getTime() - start.getTime()) / (7 * 86400000)) + 1}`;
}

function initialNodeUrl(): string {
  return globalThis.localStorage?.getItem(PRIMARY_NODE_KEY) ?? config.nodeUrl;
}

function nodeCandidates(primaryUrl: string): string[] {
  const saved = globalThis.localStorage?.getItem(KNOWN_NODES_KEY)?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
  return [...new Set([primaryUrl, config.nodeUrl, "http://127.0.0.1:8787", "http://localhost:8787", ...saved])];
}

async function probeNode(url: string): Promise<NodeProbe> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    const body = await response.json().catch(() => ({})) as { events?: number };
    return {
      url,
      online: response.ok,
      eventCount: Number(body.events ?? 0),
      latencyMs: Math.round(performance.now() - started),
      error: response.ok ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    return { url, online: false, eventCount: 0, error: error instanceof Error ? error.message : "unreachable" };
  } finally {
    window.clearTimeout(timer);
  }
}

async function postEvent(url: string, event: AquaEvent): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal
    });
    if (!response.ok && response.status !== 409) throw new Error(`HTTP ${response.status}`);
  } finally {
    window.clearTimeout(timer);
  }
}

createRoot(document.getElementById("root")!).render(<App />);
