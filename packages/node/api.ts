import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { type NodeApp } from './server.ts';
import { createIdentityClaim, createPohwAttest, identityState, type PohwStatus } from '../identity/identity.ts';
import { createGenesis } from '../money/earth.ts';
import { issueWeeklyAqua } from '../money/aqua.ts';
import { createTransfer, canSpend, DEFAULT_MONEY_CONFIG, deriveMoney } from '../money/money.ts';
import { getBalance } from '../money/balances.ts';
import { createProposal } from '../governance/proposals.ts';
import { castVote } from '../governance/votes.ts';
import { setProxy, revokeProxy } from '../governance/proxies.ts';
import { governanceState, tallyProposal } from '../governance/tally.ts';
import { publishOutcome } from '../governance/outcomes.ts';
import { deterministicCommittee } from '../governance/committees.ts';
import { createQuote, activeQuotes } from '../dex/quotes.ts';
import { openEscrow, releaseEscrow, refundEscrow } from '../dex/escrow.ts';
import { witnessAttest } from '../dex/witnesses.ts';
import { dexState } from '../dex/index.ts';
import { createChatMessage, createChatRoom, chatState } from '../chat/chat.ts';
import { type AquaEvent } from '../protocol/event.ts';

export async function route(app: NodeApp, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'OPTIONS') return send(res, 204, null);

  try {
    if (req.method === 'GET' && url.pathname === '/') return serveWeb(res, 'index.html');
    if (req.method === 'GET' && url.pathname.startsWith('/web/')) return serveWeb(res, url.pathname.slice('/web/'.length));

    if (req.method === 'POST' && url.pathname === '/identity/create') {
      const body = await json(req);
      const claim = createIdentityClaim(app.keypair, body.name ?? 'local-human');
      app.addEvent(claim);
      const attest = createPohwAttest(app.keypair, app.keypair.publicKey, body.pohwStatus ?? 'unverified');
      app.addEvent(attest);
      return send(res, 200, { publicKey: app.keypair.publicKey, claim, pohw: attest });
    }

    if (req.method === 'GET' && url.pathname === '/identity') {
      const state = identityState(app.storage.appliedEvents());
      return send(res, 200, {
        publicKey: app.keypair.publicKey,
        pohwStatus: state.pohw.get(app.keypair.publicKey) ?? 'unverified',
        verified: state.verified.includes(app.keypair.publicKey)
      });
    }

    if (req.method === 'POST' && url.pathname === '/event') {
      const event = await json(req) as AquaEvent;
      const added = app.addEvent(event);
      return send(res, added ? 200 : 400, { added });
    }

    if (req.method === 'GET' && url.pathname === '/events') return send(res, 200, app.storage.allEvents());
    if (req.method === 'GET' && url.pathname.startsWith('/events/')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
      return send(res, 200, app.storage.dag.get(id) ?? null);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/balance/')) {
      const pubkey = decodeURIComponent(url.pathname.slice('/balance/'.length));
      return send(res, 200, getBalance(deriveMoney(app.storage.appliedEvents()), pubkey));
    }

    if (req.method === 'POST' && url.pathname === '/money/issue-weekly') {
      const body = await json(req);
      const ids = identityState(app.storage.appliedEvents()).verified;
      const targets = body.pubkey ? [body.pubkey] : ids;
      const events = [];
      for (const pubkey of targets) {
        if (!ids.includes(pubkey)) continue;
        const event = issueWeeklyAqua(app.keypair, pubkey, app.config.weeklyAquaPerVerifiedHuman);
        app.addEvent(event);
        events.push(event);
      }
      return send(res, 200, { issued: events.length, events });
    }

    if (req.method === 'POST' && url.pathname === '/money/transfer') {
      const body = await json(req);
      if (!canSpend(app.storage.appliedEvents(), app.keypair.publicKey, body.amount)) return send(res, 400, { error: 'insufficient-balance' });
      const event = createTransfer(app.keypair, body.to, body.amount, app.config.fireTaxRate);
      app.addEvent(event);
      return send(res, 200, event);
    }

    if (req.method === 'POST' && url.pathname === '/governance/proposal') {
      const body = await json(req);
      const event = createProposal(app.keypair, body.title, body.body, body.choices);
      app.addEvent(event);
      return send(res, 200, event);
    }

    if (req.method === 'POST' && url.pathname === '/governance/vote') {
      const body = await json(req);
      const event = castVote(app.keypair, body.proposalId, body.choice);
      app.addEvent(event);
      return send(res, 200, { event, tally: tallyProposal(app.storage.appliedEvents(), body.proposalId) });
    }

    if (req.method === 'POST' && url.pathname === '/governance/proxy') {
      const body = await json(req);
      const event = body.revoke ? revokeProxy(app.keypair) : setProxy(app.keypair, body.proxy);
      app.addEvent(event);
      return send(res, 200, event);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/governance/tally/')) {
      const proposalId = decodeURIComponent(url.pathname.slice('/governance/tally/'.length));
      return send(res, 200, tallyProposal(app.storage.appliedEvents(), proposalId));
    }

    if (req.method === 'POST' && url.pathname === '/governance/outcome') {
      const body = await json(req);
      const tally = tallyProposal(app.storage.appliedEvents(), body.proposalId);
      const event = publishOutcome(app.keypair, body.proposalId, tally.tally, body.note);
      const added = app.addEvent(event);
      return send(res, added ? 200 : 400, added ? event : { error: 'invalid-outcome' });
    }

    if (req.method === 'POST' && url.pathname === '/dex/quote') {
      const body = await json(req);
      const event = createQuote(app.keypair, {
        side: body.side ?? 'sell',
        base: body.base ?? 'AQUA',
        quote: body.quote ?? 'LOCAL',
        amount: body.amount,
        price: body.price,
        expiresAt: body.expiresAt ?? Date.now() + 60_000
      });
      app.addEvent(event);
      return send(res, 200, event);
    }

    if (req.method === 'POST' && url.pathname === '/dex/escrow') {
      const body = await json(req);
      let event;
      if (body.action === 'release') event = releaseEscrow(app.keypair, body.escrowId, body.buyer, body.seller, body.amount);
      else if (body.action === 'refund') event = refundEscrow(app.keypair, body.escrowId, body.buyer, body.amount);
      else event = openEscrow(app.keypair, body.seller, body.amount, body.quoteId);
      app.addEvent(event);
      return send(res, 200, event);
    }

    if (req.method === 'POST' && url.pathname === '/dex/witness') {
      const body = await json(req);
      const event = witnessAttest(app.keypair, body.subjectEventId, body.statement);
      app.addEvent(event);
      return send(res, 200, event);
    }

    if (req.method === 'GET' && url.pathname === '/dex') {
      return send(res, 200, { quotes: activeQuotes(app.storage.appliedEvents()), state: serializeDex(dexState(app.storage.appliedEvents())) });
    }

    if (req.method === 'GET' && url.pathname === '/chat') {
      return send(res, 200, serializeChat(chatState(app.storage.appliedEvents())));
    }

    if (req.method === 'POST' && url.pathname === '/chat/room') {
      const body = await json(req);
      const event = createChatRoom(app.keypair, body.roomId, body.name, body.topic);
      const added = app.addEvent(event);
      return send(res, added ? 200 : 400, added ? event : { error: 'invalid-chat-room' });
    }

    if (req.method === 'POST' && url.pathname === '/chat/message') {
      const body = await json(req);
      const event = createChatMessage(app.keypair, body.roomId, body.text);
      const added = app.addEvent(event);
      return send(res, added ? 200 : 400, added ? event : { error: 'invalid-chat-message' });
    }

    if (req.method === 'GET' && url.pathname === '/peers') return send(res, 200, app.peerBook.all());
    if (req.method === 'POST' && url.pathname === '/peers/connect') {
      const body = await json(req);
      await app.connectPeer(body.url);
      return send(res, 200, { connected: body.url });
    }

    if (req.method === 'GET' && url.pathname === '/bundle/export') return send(res, 200, app.storage.exportBundle());
    if (req.method === 'POST' && url.pathname === '/bundle/import') {
      const count = app.storage.importBundle(await json(req));
      app.broadcastHello();
      return send(res, 200, { imported: count });
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      const events = app.storage.appliedEvents();
      const gov = governanceState(events);
      return send(res, 200, {
        protocol: 'aqua.base.v0.1',
        moduleVersions: { identity: 'v0.1', money: 'v0.1', governance: 'v0.1', dex: 'v0.1' },
        identity: identityState(events),
        money: getBalance(deriveMoney(events), app.keypair.publicKey),
        proposals: [...gov.proposals.values()],
        quotes: activeQuotes(events),
        committeePreview: deterministicCommittee(identityState(events).verified, 3, events)
      });
    }

    return send(res, 404, { error: 'not-found' });
  } catch (error: any) {
    return send(res, 500, { error: error.message });
  }
}

async function json(req: IncomingMessage): Promise<any> {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function send(res: ServerResponse, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (body === null) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body, null, 2));
}

function serveWeb(res: ServerResponse, file: string) {
  const safe = file.replaceAll('\\', '/').replaceAll('..', '');
  const path = join(process.cwd(), 'packages', 'web', safe);
  const content = readFileSync(path);
  res.setHeader('Content-Type', safe.endsWith('.css') ? 'text/css' : safe.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(content);
}

function serializeDex(state: any) {
  return {
    escrows: [...state.escrows.values()],
    vouchers: [...state.vouchers.entries()].map(([poolId, pool]: any) => ({ poolId, locked: pool.locked, credits: [...pool.credits.entries()] })),
    witnessAttestations: state.witnessAttestations
  };
}

function serializeChat(state: any) {
  return {
    rooms: [...state.rooms.values()],
    messages: [...state.messages.entries()].map(([roomId, events]: any) => ({ roomId, events }))
  };
}
