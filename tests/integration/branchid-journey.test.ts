import { expect, it } from "vitest";
import { branchCommand, branchEligibility, branchPeriod, createBranchDemo, hashHex, memberForKey, replayBranch } from "../../packages/protocol/src/index.js";

it("runs separate identities from invitation through pending, final admission, governance and funded demo UBI", () => {
  const demo = createBranchDemo(Date.UTC(2026,9,1));
  const community = demo.authority.state.community;
  const founder = demo.people[0]!; const recipient = demo.people[4]!;
  const invitation = branchCommand(community, founder, { kind: "invite", recipient: recipient.publicKey, expires: demo.time + 86400000, policy: 1 });
  demo.authority.submit(invitation, demo.time);
  const queued = branchCommand(community, recipient, { kind: "join", invite: hashHex(invitation), name: "David" });
  expect(memberForKey(demo.authority.state, recipient.publicKey)).toBeUndefined();
  expect(branchEligibility(demo.authority.state, recipient.publicKey, demo.time).canClaim).toBe(false);
  demo.authority.submit(queued, demo.time); // Reconnect to this single local demo authority.
  demo.authority.submit(queued, demo.time); // Retry is idempotent.
  expect(Object.keys(demo.authority.state.members)).toHaveLength(5);
  const proposal = branchCommand(community, recipient, { kind: "propose", depth: 2, capacity: 884, policy: 1, rationale: "Recognised members share a bounded growth decision." });
  demo.authority.submit(proposal, demo.time);
  for (const voter of [founder, demo.people[1]!, recipient]) demo.authority.submit(branchCommand(community, voter, { kind: "ballot", proposal: hashHex(proposal), choice: "yes", publicConsent: true }), demo.time);
  demo.time += 7 * 86400000;
  demo.authority.submit(branchCommand(community, recipient, { kind: "close", proposal: hashHex(proposal) }), demo.time);
  demo.authority.submit(branchCommand(community, recipient, { kind: "claim", period: branchPeriod(demo.time) }), demo.time);
  expect(demo.authority.state.policy.released).toBe(884);
  expect(branchEligibility(demo.authority.state, recipient.publicKey, demo.time).paid).toBe(true);
  const archive = demo.authority.archive;
  expect(replayBranch(archive, archive.genesis.authority)).toEqual(demo.authority.state);
  // A separate demo cannot import this admission as its own membership.
  const other = createBranchDemo(demo.time);
  expect(() => other.authority.submit(queued, demo.time)).toThrow(/community/);
  expect(memberForKey(other.authority.state, recipient.publicKey)).toBeUndefined();
});
