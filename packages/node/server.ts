import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadOrCreateKeypair } from '../identity/identity.ts';
import { createGenesis, DEFAULT_EARTH_TOTAL } from '../money/earth.ts';
import { DEFAULT_MONEY_CONFIG, type MoneyConfig } from '../money/money.ts';
import { NodeStorage } from './storage.ts';
import { route } from './api.ts';
import { PeerBook } from '../gossip/peer.ts';
import { acceptWebSocket, type MiniWebSocket } from '../gossip/websocket.ts';
import { handleSyncMessage } from '../gossip/sync.ts';
import { type AquaEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export class NodeApp {
  dataDir: string;
  storage: NodeStorage;
  keypair: KeyPair;
  peerBook = new PeerBook();
  peers = new Set<any>();
  config: MoneyConfig;

  constructor(dataDir: string, config: Partial<MoneyConfig> = {}) {
    this.dataDir = dataDir;
    this.storage = new NodeStorage(dataDir);
    this.keypair = loadOrCreateKeypair(join(dataDir, 'identity-keypair.json'));
    this.config = { ...DEFAULT_MONEY_CONFIG, ...config };
    this.ensureGenesis();
  }

  ensureGenesis() {
    if (!this.storage.allEvents().some((e) => e.type === 'money.genesis')) {
      this.addEvent(createGenesis(this.keypair, this.config.earthTotal ?? DEFAULT_EARTH_TOTAL));
    }
  }

  addEvent(event: AquaEvent): boolean {
    const added = this.storage.addEvent(event);
    if (added) this.broadcast({ type: 'events', events: [event] });
    return added;
  }

  attachServerWs(server: Server) {
    server.on('upgrade', (req, socket) => {
      const ws = acceptWebSocket(req, socket);
      if (!ws) return socket.end();
      this.registerPeer(ws, `server:${req.socket.remoteAddress ?? 'peer'}`);
    });
  }

  registerPeer(peer: any, url: string) {
    this.peers.add(peer);
    this.peerBook.set(url, true);
    peer.onMessage = (msg: any) => handleSyncMessage(this, msg, (out) => peer.send(out), (event) => this.broadcast({ type: 'events', events: [event] }, peer));
    peer.onClose = () => {
      this.peers.delete(peer);
      this.peerBook.set(url, false);
    };
    peer.send({ type: 'hello', ids: this.ids() });
  }

  async connectPeer(url: string) {
    const WebSocketCtor = globalThis.WebSocket;
    if (!WebSocketCtor) throw new Error('global WebSocket client unavailable in this Node runtime');
    const ws = new WebSocketCtor(url);
    const peer = {
      send: (msg: any) => ws.send(JSON.stringify(msg)),
      close: () => ws.close(),
      onMessage: undefined as any,
      onClose: undefined as any
    };
    ws.addEventListener('open', () => this.registerPeer(peer, url), { once: true });
    ws.addEventListener('message', (event: any) => peer.onMessage?.(JSON.parse(event.data), peer));
    ws.addEventListener('close', () => peer.onClose?.());
    ws.addEventListener('error', () => {
      this.peerBook.set(url, false);
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`peer connect timeout: ${url}`)), 5000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`peer connect failed: ${url}`));
      }, { once: true });
    });
  }

  broadcast(message: any, except?: any) {
    for (const peer of this.peers) {
      if (peer !== except) peer.send(message);
    }
  }

  broadcastHello() {
    this.broadcast({ type: 'hello', ids: this.ids() });
  }

  ids() {
    return this.storage.ids();
  }

  all() {
    return this.storage.allEvents();
  }

  close() {
    for (const peer of this.peers) peer.close?.();
    this.peers.clear();
  }
}

export function startNode(args = process.argv.slice(2)) {
  const opts = parseArgs(args);
  const port = Number(opts.port ?? 7001);
  const dataDir = opts.data ?? join(process.cwd(), `.aqua-node-${port}`);
  const app = new NodeApp(dataDir);
  const server = createServer((req, res) => route(app, req, res));
  app.attachServerWs(server);
  server.listen(port, () => {
    console.log(`Project Aqua node listening on http://localhost:${port}`);
    if (opts.peer) app.connectPeer(opts.peer).catch((err) => console.error(err.message));
  });
  return { app, server };
}

function parseArgs(args: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) out[arg.slice(2)] = args[i + 1]?.startsWith('--') ? true : args[++i];
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (globalThis as any).__aquaNodeRuntime = startNode();
}
