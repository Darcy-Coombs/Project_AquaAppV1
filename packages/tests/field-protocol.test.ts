import test from 'node:test';
import assert from 'node:assert/strict';

const events = await import('../field-web/protocol/events.js');
const stateModule = await import('../field-web/protocol/state.js');
const validator = await import('../field-web/protocol/validator.js');

type KeyPair = { publicKey: string; privateKey: string };
type ProtocolState = ReturnType<typeof stateModule.initialState>;

async function signed(type: string, payload: any, keypair: KeyPair, state: ProtocolState) {
  return events.signEvent(events.createEvent(type, payload, keypair.publicKey, parents(state)), keypair.privateKey);
}

async function append(state: ProtocolState, event: any) {
  const check = await validator.validateEvent(event, state);
  assert.equal(check.ok, true, check.reason);
  stateModule.applyEvent(event, state);
  return event;
}

async function rejected(state: ProtocolState, event: any, reason: string) {
  const check = await validator.validateEvent(event, state);
  assert.equal(check.ok, false);
  assert.equal(check.reason, reason);
}

async function user(state: ProtocolState, email: string, mode: 'email' | 'pohw' | 'beta' = 'email') {
  const keypair = await events.generateIdentityKeypair();
  const emailHash = await hash(email);
  await append(state, await signed('identity.email_claim', { emailHash, createdAt: Date.now() }, keypair, state));
  if (mode === 'pohw') {
    await append(state, await signed('identity.pohw_simple', {
      emailHash,
      challengeText: 'Aqua field beta',
      responseHash: await hash(`${email}|human`),
      completedAt: Date.now(),
      score: 1,
      method: 'simple-beta-pohw'
    }, keypair, state));
  }
  if (mode === 'beta') {
    await append(state, await signed('identity.beta_override', {
      codeHash: await hash('BETAoverride'),
      reason: 'beta testing only',
      expiresAt: Date.now() + 60_000
    }, keypair, state));
  }
  return keypair;
}

test('identity level gates voting', async () => {
  const state = stateModule.initialState();
  const proposer = await user(state, 'proposer@example.test', 'pohw');
  const unverified = await user(state, 'level0@example.test');
  const beta = await user(state, 'beta@example.test', 'beta');

  const proposal = await append(state, await signed('governance.proposal_create', {
    title: 'Test proposal',
    choices: ['yes', 'no']
  }, proposer, state));

  await rejected(state, await signed('governance.vote_cast', {
    proposalId: proposal.id,
    choice: 'yes'
  }, unverified, state), 'vote-author-not-verified');

  await append(state, await signed('governance.vote_cast', {
    proposalId: proposal.id,
    choice: 'yes'
  }, beta, state));

  assert.equal(stateModule.tallyProposal(state, proposal.id).tally.yes, 1);
});

test('PoHW users vote, direct vote overrides proxy, revoke removes delegation, latest vote counts once', async () => {
  const state = stateModule.initialState();
  const alice = await user(state, 'alice@example.test', 'pohw');
  const bob = await user(state, 'bob@example.test', 'pohw');
  const carol = await user(state, 'carol@example.test', 'pohw');
  const proposal = await append(state, await signed('governance.proposal_create', {
    title: 'Proxy test',
    choices: ['yes', 'no']
  }, alice, state));

  await append(state, await signed('governance.proxy_set', { proxy: alice.publicKey }, bob, state));
  await append(state, await signed('governance.proxy_set', { proxy: alice.publicKey }, carol, state));
  await append(state, await signed('governance.proxy_revoke', {}, carol, state));
  await append(state, await signed('governance.vote_cast', { proposalId: proposal.id, choice: 'yes' }, alice, state));
  await append(state, await signed('governance.vote_cast', { proposalId: proposal.id, choice: 'no' }, bob, state));
  await append(state, await signed('governance.vote_cast', { proposalId: proposal.id, choice: 'yes' }, bob, state));

  const tally = stateModule.tallyProposal(state, proposal.id);
  assert.equal(tally.counted[bob.publicKey], 'direct:yes');
  assert.equal(tally.counted[carol.publicKey], undefined);
  assert.equal(tally.tally.yes, 2);
  assert.equal(tally.tally.no ?? 0, 0);
});

test('transfers apply 4% Fire globally and reject insufficient balance', async () => {
  const state = stateModule.initialState();
  const sender = await user(state, 'sender@example.test', 'pohw');
  const receiver = await user(state, 'receiver@example.test', 'pohw');

  await append(state, await signed('money.issue_aqua', { to: sender.publicKey, amount: 100, betaDev: true }, sender, state));
  await append(state, await signed('money.transfer', {
    from: sender.publicKey,
    to: receiver.publicKey,
    amount: 25,
    netAmount: 24,
    fireAmount: 1,
    fireTaxRate: 0.04
  }, sender, state));

  assert.equal(stateModule.getAquaBalance(state, sender.publicKey), 75);
  assert.equal(stateModule.getAquaBalance(state, receiver.publicKey), 24);
  assert.equal(state.money.sump, 1);
  await rejected(state, await signed('money.transfer', {
    from: sender.publicKey,
    to: receiver.publicKey,
    amount: 1000,
    netAmount: 960,
    fireAmount: 40,
    fireTaxRate: 0.04
  }, sender, state), 'insufficient-balance');
});

test('escrow release fails without witness threshold', async () => {
  const state = stateModule.initialState();
  const buyer = await user(state, 'buyer@example.test', 'pohw');
  const seller = await user(state, 'seller@example.test', 'pohw');
  await append(state, await signed('money.issue_aqua', { to: buyer.publicKey, amount: 50, betaDev: true }, buyer, state));
  const escrow = await append(state, await signed('dex.escrow_open', {
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    lockedFrom: buyer.publicKey,
    amount: 20,
    witnessThreshold: 1,
    timeoutAt: Date.now() + 60_000
  }, buyer, state));

  await rejected(state, await signed('dex.escrow_release', {
    escrowId: escrow.id,
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    amount: 20,
    releaseTo: seller.publicKey
  }, seller, state), 'witness-threshold-not-met');
});

test('invalid imported signature is rejected', async () => {
  const state = stateModule.initialState();
  const first = await user(state, 'first@example.test', 'pohw');
  const second = await user(state, 'second@example.test', 'pohw');
  const valid = await signed('chat.room_create', { roomId: 'sig-room', name: 'Signature Room' }, first, state);
  const other = await signed('chat.room_create', { roomId: 'other-room', name: 'Other Room' }, second, state);

  await rejected(state, { ...valid, signature: other.signature }, 'event-signature-invalid');
});

test('legacy node identity events replay as verified beta identities', async () => {
  const state = stateModule.initialState();
  const legacy = await events.generateIdentityKeypair();
  await append(state, await signed('identity.claim', {
    name: 'legacy-human',
    privacy: 'no private personal data on ledger'
  }, legacy, state));
  await append(state, await signed('identity.pohw_attest', {
    subject: legacy.publicKey,
    status: 'locally_verified',
    method: 'prototype-local-attestation',
    biometricData: false
  }, legacy, state));
  assert.equal(stateModule.isVerifiedIdentity(state, legacy.publicKey), true);
});

function parents(state: ProtocolState) {
  return state.events.slice().sort(stateModule.compareEvents).slice(-2).map((event: any) => event.id);
}

function hash(value: string) {
  return events.sha256Hex(events.textBytes(value));
}
