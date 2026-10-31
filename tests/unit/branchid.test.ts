import { describe, expect, it } from "vitest";
import { allocateBranchTranche, assertBranchAdmissionCapacity, branchCommand, branchDiagnostics, branchEligibility, branchPeriod, createBranchDemo, createKeyPair, hashHex, invitationsAvailable, memberForKey, replayBranch, type BranchBody } from "../../packages/protocol/src/index.js";

function setup() {
  const demo = createBranchDemo(Date.UTC(2026, 9, 1));
  const send = (actor: number, body: BranchBody) => { const command = branchCommand(demo.authority.state.community, demo.people[actor]!, body); demo.authority.submit(command, demo.time); return command; };
  const invite = (recipient = demo.people[4]!, sponsor = 0) => send(sponsor, { kind: "invite", recipient: recipient.publicKey, expires: demo.time + 86400000, policy: demo.authority.state.policy.version });
  const join = (sponsor = 0) => { const invitation = invite(demo.people[4], sponsor); return send(4, { kind: "join", invite: hashHex(invitation), name: "New member" }); };
  const grow = () => {
    const state = demo.authority.state;
    const proposal = send(0, { kind: "propose", rationale: "Release a bounded fair-share tranche", policy: state.policy.version, depth: state.policy.depth + 1, capacity: state.policy.depth === 1 ? 884 : 2500 });
    [0,1,2].forEach(actor => send(actor, { kind: "ballot", proposal: hashHex(proposal), choice: "yes", publicConsent: true }));
    demo.time += state.policy.windowMs;
    send(0, { kind: "close", proposal: hashHex(proposal) });
    return proposal;
  };
  return { demo, send, invite, join, grow };
}
describe("BranchID signed admissions", () => {
  it("checks the absolute 2500 cap, released capacity and depth at admission, and fairly allocates 1616 places", () => {
    const { demo } = setup(); const state = demo.authority.state;
    const sponsor = Object.values(state.members)[0]!;
    state.policy.depth = 3; state.policy.released = 2500;
    const template = { ...sponsor, depth: 2, allocation: 10 };
    state.members = Object.fromEntries(Array.from({ length: 2499 }, (_, i) => [`m${i}`, { ...template, id: `m${i}` }]));
    expect(() => assertBranchAdmissionCapacity(state, template)).not.toThrow();
    state.members.last = { ...template, id: "last" };
    expect(() => assertBranchAdmissionCapacity(state, template)).toThrow(/capacity/);
    delete state.members.last;
    state.policy.released = 884;
    expect(() => assertBranchAdmissionCapacity(state, template)).toThrow(/capacity/);
    state.policy.released = 2500;
    expect(() => assertBranchAdmissionCapacity(state, { ...template, depth: 3 })).toThrow(/gate/);
    const ids = Array.from({ length: 800 }, (_, i) => `m${String(i).padStart(4, "0")}`);
    const allocation = allocateBranchTranche(ids, 1616, 10);
    expect(Object.values(allocation).reduce((a,b) => a+b,0)).toBe(1616);
    expect(Object.values(allocation).filter(n => n === 3)).toHaveLength(16);
    expect(allocateBranchTranche([...ids].reverse(),1616,10)).toEqual(allocation);
    expect(Object.values(allocateBranchTranche(["a","b"],800,10))).toEqual([10,10]);
  });
  it("bootstraps exactly four equal founders without assigning existing accounts", () => {
    const { demo } = setup(); const state = demo.authority.state;
    expect(Object.values(state.members)).toHaveLength(4);
    expect(Object.values(state.members).every(m => m.depth === 0 && m.successful === 0 && m.allocation === 20)).toBe(true);
    expect(memberForKey(state, demo.people[4]!.publicKey)).toBeUndefined();
    const archive = demo.authority.archive;
    archive.genesis.founders.pop();
    expect(() => replayBranch(archive, archive.genesis.authority)).toThrow(/bootstrap/);
  });
  it("binds to recipients, derives lineage and rejects duplicates, self-sponsorship and caller-supplied depth", () => {
    const { demo, send, invite } = setup(); const invitation = invite();
    expect(() => send(1, { kind: "join", invite: hashHex(invitation), name: "Imposter" })).toThrow(/Duplicate/);
    const stranger = createKeyPair();
    expect(() => demo.authority.submit(branchCommand(demo.authority.state.community, stranger, { kind: "join", invite: hashHex(invitation), name: "Stranger" }), demo.time)).toThrow(/different recipient/);
    expect(() => branchCommand(demo.authority.state.community, stranger, { kind: "join", invite: hashHex(invitation), name: "x", depth: 0 } as never)).toThrow();
    send(4, { kind: "join", invite: hashHex(invitation), name: "New" });
    const member = memberForKey(demo.authority.state, demo.people[4]!.publicKey)!;
    expect(member.depth).toBe(1); expect(member.sponsor).toBe(member.root);
    expect(() => invite(demo.people[0])).toThrow(/already belongs/);
    expect(() => send(4, { kind: "join", invite: hashHex(invitation), name: "Again" })).toThrow(/Duplicate/);
    send(4, { kind: "leave" });
    expect(() => send(4, { kind: "join", invite: hashHex(invitation), name: "Reset quota" })).toThrow(/Duplicate/);
  });
  it("rejects forged signatures, cross-community commands and unauthorised policy changes", () => {
    const { demo, invite } = setup(); const command = invite();
    expect(() => demo.authority.submit({ ...command, signature: "00".repeat(64) }, demo.time)).toThrow(/signature/);
    expect(() => demo.authority.submit({ ...command, community: "elsewhere" }, demo.time)).toThrow(/signature/);
    expect(() => branchCommand(demo.authority.state.community, demo.people[0]!, { kind: "policy", cap: 3000 } as never)).toThrow();
    expect(() => replayBranch(demo.authority.archive, demo.people[0]!.publicKey)).toThrow(/bootstrap/);
  });
  it("enforces expiration atomically with no partially consumed invitation", () => {
    const { demo, send, invite } = setup(); const invitation = invite(); demo.time += 86400000;
    const before = demo.authority.archive;
    expect(() => send(4, { kind: "join", invite: hashHex(invitation), name: "Late" })).toThrow(/expired/);
    expect(demo.authority.archive).toEqual(before);
    expect(demo.authority.state.invites[hashHex(invitation)]!.consumed).toBeNull();
  });
  it("does not let pending invites bypass the founder's 20 lifetime successes", async () => {
    const { demo, invite } = setup();
    const guests = Array.from({ length: 21 }, () => createKeyPair());
    const invites = guests.map(guest => invite({ ...guest, name: "Guest" }));
    const results = await Promise.allSettled(guests.map((guest, i) => Promise.resolve().then(() => demo.authority.submit(branchCommand(demo.authority.state.community, guest, { kind: "join", invite: hashHex(invites[i]), name: "Guest" }), demo.time))));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(20);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(Object.keys(demo.authority.state.members)).toHaveLength(24);
    expect(invitationsAvailable(demo.authority.state, memberForKey(demo.authority.state, demo.people[0]!.publicKey)!)).toBe(0);
  });
  it("keeps descendants closed until approved gates and enforces ordinary lifetime quota", () => {
    const { demo, join, grow } = setup(); join();
    const recipient = createKeyPair();
    const makeInvite = (key: string) => branchCommand(demo.authority.state.community, demo.people[4]!, { kind: "invite", recipient: key, expires: demo.time + 100000, policy: demo.authority.state.policy.version });
    expect(() => demo.authority.submit(makeInvite(recipient.publicKey), demo.time)).toThrow(/gate/);
    grow();
    for (let i = 0; i < 10; i++) {
      const guest = createKeyPair(); const invitation = makeInvite(guest.publicKey);
      demo.authority.submit(invitation, demo.time);
      demo.authority.submit(branchCommand(demo.authority.state.community, guest, { kind: "join", invite: hashHex(invitation), name: "Second generation" }), demo.time);
    }
    expect(() => demo.authority.submit(makeInvite(recipient.publicKey), demo.time)).toThrow(/allocation/);
  });
  it("rejects missing/reordered dependencies and replays idempotently without secrets", () => {
    const { demo, invite, send } = setup();
    expect(() => send(4, { kind: "join", invite: "00".repeat(32), name: "Pending" })).toThrow(/dependency/);
    const command = invite(); const before = demo.authority.archive;
    demo.authority.submit(command, demo.time); expect(demo.authority.archive).toEqual(before);
    send(4, { kind: "join", invite: hashHex(command), name: "Admitted" });
    const archive = demo.authority.archive;
    expect(replayBranch(archive, archive.genesis.authority)).toEqual(demo.authority.state);
    expect(() => replayBranch({ ...archive, receipts: [...archive.receipts].reverse() }, archive.genesis.authority)).toThrow(/reordered/);
    expect(() => replayBranch({ ...archive, receipts: archive.receipts.slice(1) }, archive.genesis.authority)).toThrow(/Missing/);
    const publicJson = JSON.stringify(archive);
    demo.people.forEach(person => expect(publicJson).not.toContain(person.privateKey));
    expect(publicJson).not.toContain("privateKey");
  });
});

describe("BranchID public demo governance and rights", () => {
  it("snapshots voters, counts one vote, applies ceil quorum and requires closing time", () => {
    const { demo, join, send } = setup(); join();
    const proposal = send(0, { kind: "propose", rationale: "Make room for the next generation", depth: 2, capacity: 884, policy: 1 });
    const proposalId = hashHex(proposal);
    expect(demo.authority.state.proposals[proposalId]!.snapshot).toHaveLength(5);
    send(0, { kind: "ballot", proposal: proposalId, choice: "yes", publicConsent: true });
    expect(() => send(0, { kind: "ballot", proposal: proposalId, choice: "yes", publicConsent: true })).toThrow(/One vote/);
    expect(() => send(0, { kind: "close", proposal: proposalId })).toThrow(/still voting/);
    send(1, { kind: "ballot", proposal: proposalId, choice: "abstain", publicConsent: true });
    demo.time += demo.authority.state.policy.windowMs;
    send(0, { kind: "close", proposal: proposalId });
    expect(demo.authority.state.proposals[proposalId]!.result).toBe("failed");
    expect(demo.authority.state.policy.released).toBe(84);
  });
  it("requires strict majority, refuses competing proposals, and excludes late voters", () => {
    const { demo, join, send, invite } = setup(); join();
    const proposal = send(0, { kind: "propose", rationale: "Make room for the next generation", depth: 2, capacity: 884, policy: 1 });
    expect(() => send(1, { kind: "propose", rationale: "Competing growth request", depth: 2, capacity: 884, policy: 1 })).toThrow(/competing/);
    const late = createKeyPair(); const invitation = invite({ ...late, name: "Late" });
    demo.authority.submit(branchCommand(demo.authority.state.community, late, { kind: "join", invite: hashHex(invitation), name: "Late" }), demo.time);
    expect(() => demo.authority.submit(branchCommand(demo.authority.state.community, late, { kind: "ballot", proposal: hashHex(proposal), choice: "yes", publicConsent: true }), demo.time)).toThrow(/snapshot/);
    ["yes", "no", "abstain"].forEach((choice, actor) => send(actor, { kind: "ballot", proposal: hashHex(proposal), choice: choice as "yes", publicConsent: true }));
    demo.time += demo.authority.state.policy.windowMs; send(0, { kind: "close", proposal: hashHex(proposal) });
    expect(demo.authority.state.proposals[hashHex(proposal)]!.result).toBe("failed");
  });
  it("verifiably authorises bounded growth and cannot mutate policy through state getters", () => {
    const { demo, join, grow, send } = setup(); join(); const proposal = grow();
    expect(demo.authority.state.policy).toMatchObject({ version: 2, depth: 2, released: 884, cap: 2500, maxDepth: 3 });
    expect(demo.authority.state.proposals[hashHex(proposal)]!.authorization).toBeTruthy();
    demo.authority.state.policy.cap = 5000;
    expect(demo.authority.state.policy.cap).toBe(2500);
    expect(() => send(0, { kind: "propose", rationale: "Raise the absolute cap", depth: 3, capacity: 3000, policy: 2 })).toThrow(/bounded/);
    expect(() => send(0, { kind: "propose", rationale: "Skip to generation four", depth: 4, capacity: 2500, policy: 2 })).toThrow(/generation/);
  });
  it("pending signatures grant no rights, claims are member-period unique and funding-limited", () => {
    const { demo, join, send } = setup();
    expect(branchEligibility(demo.authority.state, demo.people[4]!.publicKey, demo.time).canClaim).toBe(false);
    join(); const period = branchPeriod(demo.time); send(4, { kind: "claim", period });
    expect(() => send(4, { kind: "claim", period })).toThrow(/already paid/);
    expect(demo.authority.state.received[memberForKey(demo.authority.state, demo.people[4]!.publicKey)!.id]).toBe("48000");
    [0,1,2].forEach(actor => send(actor, { kind: "claim", period }));
    expect(() => send(3, { kind: "claim", period })).toThrow(/unfunded/);
    expect(branchEligibility(demo.authority.state, demo.people[0]!.publicKey, demo.time).productionEnabled).toBe(false);
  });
  it("reviews, responses and appeals never strip rights; choice cohorts are suppressed", () => {
    const { demo, send, join } = setup(); join();
    const member = memberForKey(demo.authority.state, demo.people[4]!.publicKey)!;
    const review = send(0, { kind: "review", subject: member.id, evidence: "Onboarding activity observed; context unknown." });
    send(4, { kind: "response", review: hashHex(review), text: "We met at a workshop.", appeal: false });
    send(0, { kind: "resolve", review: hashHex(review), text: "Context recorded; no sanctions." });
    send(4, { kind: "response", review: hashHex(review), text: "Please correct the record.", appeal: true });
    expect(demo.authority.state.members[member.id]).toEqual(member);
    expect(branchEligibility(demo.authority.state, demo.people[4]!.publicKey, demo.time).canClaim).toBe(true);
    expect(branchDiagnostics(demo.authority.state, demo.time).voteBreakdowns).toBeNull();
  });
});
