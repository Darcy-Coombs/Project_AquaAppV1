import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatMessage, createChatRoom, chatState } from '../chat/chat.ts';
import { createQuote, dexState, openEscrow, releaseEscrow } from '../dex/index.ts';
import { publishOutcome } from '../governance/outcomes.ts';
import { createProposal } from '../governance/proposals.ts';
import { setProxy } from '../governance/proxies.ts';
import { tallyProposal } from '../governance/tally.ts';
import { castVote } from '../governance/votes.ts';
import { createIdentityClaim, createPohwAttest } from '../identity/identity.ts';
import { issueWeeklyAqua } from '../money/aqua.ts';
import { getBalance } from '../money/balances.ts';
import { createTransfer, deriveMoney } from '../money/money.ts';
import { NodeApp } from '../node/server.ts';

test('ten users across ten nodes exercise money, governance, chat, and DEX safety', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-acceptance-'));
  const nodes = Array.from({ length: 10 }, (_, i) => new NodeApp(join(dir, `node-${i}`)));
  const hub = nodes[0];
  const users = nodes.map((node) => node.keypair);

  try {
    for (let i = 0; i < users.length; i++) {
      assert.equal(hub.addEvent(createIdentityClaim(users[i], `user-${i + 1}`)), true);
      assert.equal(hub.addEvent(createPohwAttest(users[i], users[i].publicKey, 'locally_verified')), true);
    }

    await nextTick();
    for (const user of users) {
      assert.equal(hub.addEvent(issueWeeklyAqua(hub.keypair, user.publicKey, 480)), true);
    }

    await nextTick();
    assert.equal(hub.addEvent(createTransfer(users[1], users[2].publicKey, 100)), true);
    assert.equal(hub.addEvent(createTransfer(users[9], users[8].publicKey, 470)), true);
    assert.equal(hub.addEvent(createTransfer(users[9], users[7].publicKey, 20)), false, 'overspend transfer is rejected');

    let money = deriveMoney(hub.storage.appliedEvents());
    assert.equal(getBalance(money, users[1].publicKey).aqua, 380);
    assert.equal(getBalance(money, users[2].publicKey).aqua, 576);
    assert.equal(getBalance(money, users[9].publicKey).aqua, 10);
    assert.ok([...money.aqua.values()].every((balance) => balance >= 0), 'no derived Aqua balance is negative');

    await nextTick();
    const proposal = createProposal(users[0], 'Publish the first neighbourhood exchange list', 'List exchange offers, verify escrow, and publish outcomes.', ['yes', 'no', 'abstain']);
    assert.equal(hub.addEvent(proposal), true);
    assert.equal(hub.addEvent(setProxy(users[5], users[0].publicKey)), true);
    assert.equal(hub.addEvent(setProxy(users[6], users[0].publicKey)), true);
    assert.equal(hub.addEvent(setProxy(users[7], users[0].publicKey)), true);
    assert.equal(hub.addEvent(castVote(users[0], proposal.id, 'yes')), true);
    assert.equal(hub.addEvent(castVote(users[1], proposal.id, 'yes')), true);
    assert.equal(hub.addEvent(castVote(users[2], proposal.id, 'no')), true);
    assert.equal(hub.addEvent(castVote(users[3], proposal.id, 'abstain')), true);
    assert.equal(hub.addEvent(castVote(users[4], proposal.id, 'yes')), true);
    assert.equal(hub.addEvent(castVote(users[4], proposal.id, 'no')), true, 'changed direct vote is accepted but must not double-count');
    assert.equal(hub.addEvent(castVote(users[5], proposal.id, 'no')), true, 'direct vote overrides proxy');

    const tally = tallyProposal(hub.storage.appliedEvents(), proposal.id);
    assert.equal(tally.verifiedHumans, 10);
    assert.equal(Object.keys(tally.counted).length, 8);
    assert.equal(tally.counted[users[4].publicKey], 'direct:no');
    assert.equal(tally.counted[users[5].publicKey], 'direct:no');
    assert.equal(tally.counted[users[6].publicKey], `proxy:${users[0].publicKey}:yes`);
    assert.equal(tally.tally.yes, 4);
    assert.equal(tally.tally.no, 3);
    assert.equal(tally.tally.abstain, 1);

    const outcome = publishOutcome(users[0], proposal.id, tally.tally, 'Outcome published from replayed event state.');
    assert.equal(hub.addEvent(outcome), true);

    await nextTick();
    const room = createChatRoom(users[0], 'chaos-harbour', 'Chaos Harbour', 'Testing local-first chat rooms.');
    assert.equal(hub.addEvent(room), true);
    assert.equal(hub.addEvent(createChatRoom(users[1], 'chaos-market', 'Chaos Market', 'Exchange coordination.')), true);
    assert.equal(hub.addEvent(createChatMessage(users[2], 'chaos-harbour', 'Ten-node acceptance test is live.')), true);
    assert.equal(hub.addEvent(createChatMessage(users[3], 'chaos-market', 'Listing and verifying exchange flow.')), true);
    assert.equal(hub.addEvent(createChatMessage(users[4], 'missing-room', 'This should not land.')), false);
    const chat = chatState(hub.storage.appliedEvents());
    assert.equal(chat.rooms.size, 2);
    assert.equal(chat.messages.get('chaos-harbour')?.length, 1);

    await nextTick();
    const quote = createQuote(users[2], { side: 'sell', base: 'AQUA', quote: 'LOCAL', amount: 25, price: 1.25, expiresAt: Date.now() + 60_000 });
    assert.equal(hub.addEvent(quote), true);
    const escrow = openEscrow(users[3], users[2].publicKey, 25, quote.id);
    assert.equal(hub.addEvent(escrow), true);
    assert.equal(hub.addEvent(openEscrow(users[9], users[2].publicKey, 25, quote.id)), false, 'overdrawn escrow open is rejected');
    const release = releaseEscrow(users[2], escrow.id, users[3].publicKey, users[2].publicKey, 25);
    assert.equal(hub.addEvent(release), true);
    assert.equal(hub.addEvent(releaseEscrow(users[2], escrow.id, users[3].publicKey, users[2].publicKey, 25)), false, 'double release is rejected');

    const dex = dexState(hub.storage.appliedEvents());
    assert.equal(dex.escrows.get(escrow.id).status, 'released');
    money = deriveMoney(hub.storage.appliedEvents());
    assert.equal(getBalance(money, users[3].publicKey).locked, 0);
    assert.equal(getBalance(money, users[2].publicKey).aqua, 601);
    assert.ok([...money.locked.values()].every((balance) => balance >= 0), 'no locked balance is negative');

    const bundle = hub.storage.exportBundle();
    for (const node of nodes.slice(1)) {
      assert.ok(node.storage.importBundle(bundle) > 0);
      const nodeTally = tallyProposal(node.storage.appliedEvents(), proposal.id);
      assert.deepEqual(nodeTally.tally, tally.tally);
      assert.equal(chatState(node.storage.appliedEvents()).rooms.size, 2);
      assert.equal(dexState(node.storage.appliedEvents()).escrows.get(escrow.id).status, 'released');
    }
  } finally {
    for (const node of nodes) node.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 2));
}
