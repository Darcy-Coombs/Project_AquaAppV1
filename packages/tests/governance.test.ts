import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIdentityKeypair } from '../protocol/crypto.ts';
import { createIdentityClaim, createPohwAttest } from '../identity/identity.ts';
import { createProposal } from '../governance/proposals.ts';
import { castVote } from '../governance/votes.ts';
import { setProxy, revokeProxy } from '../governance/proxies.ts';
import { deterministicCommittee } from '../governance/committees.ts';
import { tallyProposal } from '../governance/tally.ts';

test('proposal votes, proxies, revocation, and direct override', () => {
  const alice = generateIdentityKeypair();
  const bob = generateIdentityKeypair();
  const carol = generateIdentityKeypair();
  const verified = [alice, bob, carol].flatMap((k) => [createIdentityClaim(k), createPohwAttest(k, k.publicKey, 'locally_verified')]);
  const proposal = createProposal(alice, 'Open the commons');

  let events = [...verified, proposal, setProxy(bob, alice.publicKey), castVote(alice, proposal.id, 'yes')];
  assert.equal(tallyProposal(events, proposal.id).tally.yes, 2);

  events = [...events, castVote(bob, proposal.id, 'no')];
  let tally = tallyProposal(events, proposal.id);
  assert.equal(tally.tally.yes, 1);
  assert.equal(tally.tally.no, 1);

  events = [...events, setProxy(carol, alice.publicKey), revokeProxy(carol)];
  tally = tallyProposal(events, proposal.id);
  assert.equal(tally.tally.yes, 1);
  assert.equal(tally.tally.no, 1);

  const members = [alice.publicKey, bob.publicKey, carol.publicKey];
  assert.deepEqual(deterministicCommittee(members, 2, events), deterministicCommittee(members, 2, events));
});
