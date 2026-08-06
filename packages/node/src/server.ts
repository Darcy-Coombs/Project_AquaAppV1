import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { replayEvents, validateEnvelope, type AquaBundle, type AquaEvent } from "@aqua/protocol";
import { SQLiteEventStore } from "./store.js";

const port = Number(process.env.AQUA_NODE_PORT ?? 8787);
const host = process.env.AQUA_NODE_HOST ?? "127.0.0.1";
const dbPath = process.env.AQUA_NODE_DB ?? "aqua-node.sqlite";
const store = await SQLiteEventStore.open(dbPath);
const sockets = new Set<WebSocket>();

const server = createServer(async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return sendJson(res, 204, {});
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true, events: store.allEvents().length });
    if (req.method === "GET" && url.pathname === "/events") return sendJson(res, 200, { events: store.allEvents() });
    if (req.method === "POST" && url.pathname === "/events") {
      const event = await readJson<AquaEvent>(req);
      validateEnvelope(event);
      const replay = replayEvents([...store.allEvents(), event]);
      const rejected = replay.rejected.find((entry) => entry.event.eventId === event.eventId);
      if (rejected) {
        store.addRejected(rejected);
        return sendJson(res, 422, { ok: false, reason: rejected.reason });
      }
      const inserted = store.addEvent(event);
      if (inserted) broadcast(event);
      return sendJson(res, 202, { ok: true, inserted });
    }
    if (req.method === "GET" && url.pathname === "/bundle") return sendJson(res, 200, store.exportBundle("local-node"));
    if (req.method === "POST" && url.pathname === "/bundle") {
      const bundle = await readJson<AquaBundle>(req);
      let inserted = 0;
      for (const event of bundle.events) {
        validateEnvelope(event);
        if (store.addEvent(event)) inserted += 1;
      }
      return sendJson(res, 202, { ok: true, inserted });
    }
    if (req.method === "POST" && url.pathname === "/dev/email-token") {
      const body = await readJson<{ emailHash: string }>(req);
      return sendJson(res, 200, { token: store.issueEmailToken(body.emailHash), verifyUrl: `/dev/verify-email?emailHash=${body.emailHash}` });
    }
    if (req.method === "GET" && url.pathname === "/dev/inbox") return sendJson(res, 200, { messages: store.devInbox() });
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

const wss = new WebSocketServer({ server, path: "/gossip" });
wss.on("connection", (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify({ type: "hello", events: store.allEvents() }));
  socket.on("message", (message) => {
    try {
      const event = JSON.parse(String(message)) as AquaEvent;
      validateEnvelope(event);
      if (store.addEvent(event)) broadcast(event, socket);
    } catch {
      socket.send(JSON.stringify({ type: "rejected" }));
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
  for await (const chunk of req) chunks.push(chunk as Uint8Array);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}
