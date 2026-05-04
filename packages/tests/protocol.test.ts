import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIdentityKeypair } from '../protocol/crypto.ts';
import { createEvent, eventIdFor, verifyEvent } from '../protocol/event.ts';
import { EventDag } from '../protocol/dag.ts';
import { createIdentityClaim } from '../identity/identity.ts';

test('identity keypair and event signatures work', () => {
  const keypair = generateIdentityKeypair();
  const event = createIdentityClaim(keypair, 'tester');
  assert.equal(event.author, keypair.publicKey);
  assert.equal(verifyEvent(event), true);

  const altered = { ...event, payload: { ...event.payload, name: 'tampered' } };
  assert.equal(verifyEvent(altered), false);
});

test('event IDs are deterministic and DAG stores parents and unknown modules', () => {
  const keypair = generateIdentityKeypair();
  const base = {
    module: 'identity',
    type: 'identity.claim',
    payload: { name: 'same' },
    parents: [],
    keypair,
    createdAt: 123
  };
  const a = createEvent(base);
  const b = createEvent(base);
  assert.equal(a.id, b.id);
  assert.equal(a.id, eventIdFor(a));

  const child = createEvent({ module: 'identity', type: 'identity.pohw_attest', payload: { subject: keypair.publicKey, status: 'locally_verified' }, parents: [a.id], keypair, createdAt: 124 });
  const unknown = createEvent({ module: 'chaos-bridge', type: 'chat.bridge', payload: { hello: 'chaos chat' }, keypair, createdAt: 125 });

  const dag = new EventDag();
  assert.equal(dag.add(a).valid, true);
  assert.equal(dag.add(a).event.id, a.id);
  assert.equal(dag.events.size, 1);
  assert.equal(dag.add(child).event.parents[0], a.id);
  const stored = dag.add(unknown);
  assert.equal(stored.valid, true);
  assert.equal(stored.applied, false);
});
