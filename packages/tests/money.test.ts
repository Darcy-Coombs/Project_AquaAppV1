import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIdentityKeypair } from '../protocol/crypto.ts';
import { createIdentityClaim, createPohwAttest } from '../identity/identity.ts';
import { createGenesis, DEFAULT_EARTH_TOTAL } from '../money/earth.ts';
import { issueWeeklyAqua } from '../money/aqua.ts';
import { createTransfer, canSpend, deriveMoney } from '../money/money.ts';
import { getBalance } from '../money/balances.ts';

test('money genesis, issuance, transfer tax, and rebuild', () => {
  const alice = generateIdentityKeypair();
  const bob = generateIdentityKeypair();
  const events = [
    createGenesis(alice),
    createIdentityClaim(alice),
    createPohwAttest(alice, alice.publicKey, 'locally_verified'),
    createIdentityClaim(bob),
    createPohwAttest(bob, bob.publicKey, 'locally_verified'),
    issueWeeklyAqua(alice, alice.publicKey, 480)
  ];

  let state = deriveMoney(events);
  assert.equal(state.earthReserve, DEFAULT_EARTH_TOTAL);
  assert.equal(getBalance(state, alice.publicKey).aqua, 480);
  assert.equal(canSpend(events, alice.publicKey, 481), false);

  events.push(createTransfer(alice, bob.publicKey, 100));
  state = deriveMoney(events);
  assert.equal(getBalance(state, alice.publicKey).aqua, 380);
  assert.equal(getBalance(state, bob.publicKey).aqua, 96);
  assert.equal(getBalance(state, alice.publicKey).firePaid, 4);
  assert.equal(state.sump, 4);

  const rebuilt = deriveMoney(JSON.parse(JSON.stringify(events)));
  assert.deepEqual(getBalance(rebuilt, bob.publicKey), getBalance(state, bob.publicKey));
});
