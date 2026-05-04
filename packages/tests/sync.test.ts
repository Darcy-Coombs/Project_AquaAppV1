import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startNode } from '../node/server.ts';

test('two local nodes gossip events and storage reloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-sync-'));
  const aDir = join(dir, 'a');
  const bDir = join(dir, 'b');
  const a = startNode(['--port', '18101', '--data', aDir]);
  const b = startNode(['--port', '18102', '--data', bDir]);

  try {
    await sleep(150);
    await fetch('http://localhost:18102/peers/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'ws://localhost:18101' })
    });

    const created = await post('http://localhost:18101/identity/create', { pohwStatus: 'locally_verified' });
    await eventually(async () => {
      const events = await get('http://localhost:18102/events');
      assert.ok(events.some((e: any) => e.id === created.claim.id));
    });

    const bad = { ...created.claim, signature: 'bad' };
    const badRes = await fetch('http://localhost:18102/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bad)
    });
    assert.equal(badRes.status, 400);

    b.app.close();
    b.server.close();
    const reloaded = startNode(['--port', '18103', '--data', bDir]);
    try {
      await sleep(100);
      const events = await get('http://localhost:18103/events');
      assert.ok(events.some((e: any) => e.id === created.claim.id));
    } finally {
      reloaded.app.close();
      reloaded.server.close();
    }
  } finally {
    a.app.close();
    b.app.close();
    a.server.close();
    b.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

async function post(url: string, body: any) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

async function get(url: string) {
  const res = await fetch(url);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually(fn: () => Promise<void>) {
  const started = Date.now();
  let last;
  while (Date.now() - started < 3000) {
    try {
      await fn();
      return;
    } catch (err) {
      last = err;
      await sleep(100);
    }
  }
  throw last;
}
