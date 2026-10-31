import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { replayEvents, validateEnvelope, type AquaBundle, type AquaEvent } from "@aqua/protocol";
import { SQLiteEventStore } from "./store.js";
import { readFile } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { ECONOMY_POLICY_ID, GENESIS_EARTH_SUPPLY } from "@aqua/shared";

const port = Number(process.env.AQUA_NODE_PORT ?? 8787);
const host = process.env.AQUA_NODE_HOST ?? "127.0.0.1";
const dbPath = process.env.AQUA_NODE_DB ?? "aqua-alpha-v2.sqlite";
const publicTestVoting = process.env.AQUA_ALPHA_TESTNET === "1";
const store = await SQLiteEventStore.open(dbPath);
const sockets = new Set<WebSocket>();

const server = createServer(async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return sendJson(res, 204, {});
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true, events: store.allEvents().length, mode: "alpha-testnet", finality: "single-authority", publicTestVoting, now: Date.now(), economyPolicy: store.economyPolicy, genesisEarthMinor: GENESIS_EARTH_SUPPLY.toString() });
    if (req.method === "GET" && url.pathname === "/ledger") return sendJson(res, 200, store.ledgerSnapshot());
    if (req.method === "GET" && url.pathname === "/events") return sendJson(res, 200, { events: store.allEvents() });
    if (req.method === "POST" && url.pathname === "/events") {
      const event = await readJson<AquaEvent>(req);
      const inserted = store.acceptEvent(event, Date.now(), publicTestVoting);
      if (inserted) broadcast(event);
      return sendJson(res, 202, { ok: true, inserted });
    }
    if (req.method === "GET" && url.pathname === "/bundle") return sendJson(res, 200, store.exportBundle("local-node"));
    if (req.method === "POST" && url.pathname === "/bundle") {
      const bundle = await readJson<AquaBundle>(req);
      if (bundle.bundleVersion !== 1 || !Array.isArray(bundle.events) || bundle.events.length > 2000) throw new Error("Unsupported bundle or more than 2000 events");
      let inserted = 0;
      const rejected: { eventId: string; reason: string }[] = [];
      const ordered = replayEvents([...store.allEvents(), ...bundle.events]);
      const wanted = new Set(bundle.events.map(e => e.eventId));
      for (const event of ordered.accepted.filter(e => wanted.has(e.eventId))) {
        try { if (store.acceptEvent(event, Date.now(), publicTestVoting)) { inserted++; broadcast(event); } }
        catch (error) { rejected.push({ eventId: event.eventId, reason: error instanceof Error ? error.message : "Rejected" }); }
      }
      rejected.push(...ordered.rejected.filter(e => wanted.has(e.event.eventId)).map(e => ({ eventId: e.event.eventId, reason: e.reason })), ...ordered.pending.filter(e => wanted.has(e.eventId)).map(e => ({ eventId: e.eventId, reason: "Missing parent dependency" })));
      return sendJson(res, rejected.length ? 207 : 202, { ok: rejected.length === 0, inserted, rejected });
    }
    if (req.method === "POST" && url.pathname === "/dev/email-token") {
      const body = await readJson<{ emailHash: string }>(req);
      return sendJson(res, 200, { token: store.issueEmailToken(body.emailHash), verifyUrl: `/dev/verify-email?emailHash=${body.emailHash}` });
    }
    if (req.method === "GET" && url.pathname === "/dev/inbox") return sendJson(res, 200, { messages: store.devInbox() });
    if (req.method === "GET" && process.env.AQUA_WEB_DIST) {
      const root = resolve(process.env.AQUA_WEB_DIST);
      const file = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      const path = relative(root, file);
      if (path.startsWith("..") || path.includes(":")) return sendJson(res, 403, { error: "Invalid static path" });
      const types: Record<string,string> = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json", ".png":"image/png" };
      if (!types[extname(file)]) return sendJson(res,404,{error:"Not found"});
      try { const content = await readFile(file); res.writeHead(200,{"content-type":types[extname(file)],"X-Content-Type-Options":"nosniff","Cache-Control":"no-cache"}); res.end(content); return; }
      catch { return sendJson(res,404,{error:"Static file not found"}); }
    }
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 422, { error: error instanceof Error ? error.message : "Invalid request" });
  }
});

const wss = new WebSocketServer({ server, path: "/gossip", maxPayload: 1048576 });
wss.on("connection", (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify({ type: "hello", events: store.allEvents() }));
  socket.on("message", (message) => {
    try {
      const event = JSON.parse(String(message)) as AquaEvent;
      if (store.acceptEvent(event, Date.now(), publicTestVoting)) broadcast(event, socket);
    } catch (error) {
      socket.send(JSON.stringify({ type: "rejected", reason: error instanceof Error ? error.message : "Invalid event" }));
    }
  });
  socket.on("close", () => sockets.delete(socket));
});

server.listen(port, host, () => {
  console.log(`Aqua node listening on http://${host}:${port}`);
});

function broadcast(event: AquaEvent, except?: WebSocket): void {
  for (const socket of sockets) {
    if (socket !== except && socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "event", event }));
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 4 * 1024 * 1024) throw new Error("Request exceeds 4 MB"); chunks.push(chunk as Uint8Array); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}
