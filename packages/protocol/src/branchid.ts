import { z } from "zod";
import { hashHex, signContent, verifyContent, createKeyPair } from "./crypto.js";
import { WEEKLY_UBI_AQUA, EARTH_UBI_CAP_PER_ACCOUNT } from "@aqua/shared";

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(128);
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invite"), recipient: hex, expires: z.number().int(), policy: z.number().int() }).strict(),
  z.object({ kind: z.literal("join"), invite: hex, name: z.string().trim().min(1).max(48) }).strict(),
  z.object({ kind: z.literal("propose"), rationale: z.string().trim().min(10).max(1200), depth: z.number().int(), capacity: z.number().int(), policy: z.number().int() }).strict(),
  z.object({ kind: z.literal("ballot"), proposal: hex, choice: z.enum(["yes", "no", "abstain"]), publicConsent: z.literal(true) }).strict(),
  z.object({ kind: z.literal("close"), proposal: hex }).strict(),
  z.object({ kind: z.literal("review"), subject: id, evidence: z.string().trim().min(8).max(1200) }).strict(),
  z.object({ kind: z.literal("response"), review: hex, text: z.string().trim().min(1).max(1200), appeal: z.boolean() }).strict(),
  z.object({ kind: z.literal("resolve"), review: hex, text: z.string().trim().min(1).max(1200) }).strict(),
  z.object({ kind: z.literal("leave") }).strict(),
  z.object({ kind: z.literal("claim"), period: z.string().regex(/^\d{4}-w\d{1,2}$/) }).strict()
]);
export type BranchBody = z.infer<typeof body>;
const envelope = z.object({ domain: z.literal("aqua.branchid.v1"), community: id, nonce: id, key: hex, body, signature: z.string().regex(/^[a-f0-9]{128}$/) }).strict();
export type BranchCommand = z.infer<typeof envelope>;
export type BranchPolicy = { version: number; founders: number; founderQuota: number; ordinaryQuota: number; maxDepth: number; cap: number; depth: number; released: number; windowMs: number; quorumPercent: number };
export const BRANCH_POLICY: Readonly<BranchPolicy> = Object.freeze({ version: 1, founders: 4, founderQuota: 20, ordinaryQuota: 10, maxDepth: 3, cap: 2500, depth: 1, released: 84, windowMs: 7 * 86400000, quorumPercent: 50 });
export type BranchMember = { id: string; key: string; name: string; sponsor: string | null; root: string; depth: number; admission: string; status: "admitted" | "left"; admittedAt: number; successful: number; allocation: number };
export type BranchInvite = { id: string; sponsor: string; recipient: string; expires: number; policy: number; consumed: string | null; command: BranchCommand };
export type BranchProposal = { id: string; author: string; rationale: string; policy: number; depth: number; capacity: number; snapshot: string[]; allocations: Record<string, number>; closes: number; votes: Record<string, "yes" | "no" | "abstain">; result: "open" | "approved" | "failed"; authorization?: string };
export type BranchReview = { id: string; subject: string; reporter: string; evidence: string; openedAt: number; responses: { member: string; text: string; appeal: boolean }[]; decision?: string };
export type BranchState = { community: string; policy: BranchPolicy; members: Record<string, BranchMember>; invites: Record<string, BranchInvite>; proposals: Record<string, BranchProposal>; reviews: Record<string, BranchReview>; claims: Record<string, string>; received: Record<string, string>; funding: string; processed: string[]; lastTime: number };
export type BranchGenesis = { domain: "aqua.branchid.genesis.v1"; mode: "demo"; community: string; authority: string; founders: { key: string; name: string }[]; time: number; funding: string; signature: string };
export type BranchReceipt = { sequence: number; previous: string; time: number; command: BranchCommand; stateHash: string; signature: string };
export type BranchArchive = { version: 1; genesis: BranchGenesis; receipts: BranchReceipt[] };

export function branchCommand(community: string, pair: { publicKey: string; privateKey: string }, value: BranchBody, nonce = crypto.randomUUID()): BranchCommand {
  const content = { domain: "aqua.branchid.v1" as const, community, nonce, key: pair.publicKey, body: body.parse(value) };
  return { ...content, signature: signContent(pair.privateKey, content) };
}
export function validateBranchCommand(command: BranchCommand, community: string): void {
  envelope.parse(command);
  const { signature, ...content } = command;
  if (command.community !== community || !verifyContent(command.key, signature, content)) throw new Error("Invalid signature or community");
}
export function memberForKey(state: BranchState, key: string): BranchMember | undefined {
  return Object.values(state.members).find(member => member.key === key);
}
export function invitationsAvailable(state: BranchState, member: BranchMember): number {
  if (member.status !== "admitted" || member.depth >= state.policy.depth) return 0;
  return Math.max(0, Math.min(member.depth === 0 ? state.policy.founderQuota : state.policy.ordinaryQuota, member.allocation) - member.successful);
}
export function assertBranchAdmissionCapacity(state: BranchState, sponsor: BranchMember): void {
  requireValue(invitationsAvailable(state, sponsor) > 0, "Growth gate closed or sponsor quota exhausted");
  requireValue(sponsor.depth + 1 <= state.policy.maxDepth, "Maximum depth reached");
  requireValue(Object.keys(state.members).length < Math.min(state.policy.released, state.policy.cap), "Community capacity full");
}
export function allocateBranchTranche(sponsorIds: string[], capacity: number, quota: number): Record<string, number> {
  const ids = [...new Set(sponsorIds)].sort();
  return Object.fromEntries(ids.map((id, index) => [id, Math.min(quota, Math.floor(capacity / ids.length) + (index < capacity % ids.length ? 1 : 0))]));
}
export function branchPeriod(time: number): string {
  const now = new Date(time);
  return `${now.getUTCFullYear()}-w${Math.floor((time - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * 86400000)) + 1}`;
}
export function branchEligibility(state: BranchState, key: string, time: number) {
  const member = memberForKey(state, key);
  const entitled = member?.status === "admitted";
  const paid = !!member && !!state.claims[`${member.id}:${branchPeriod(time)}`];
  const funded = BigInt(state.funding) >= WEEKLY_UBI_AQUA;
  const withinLifetime = !!member && BigInt(state.received[member.id] ?? "0") + WEEKLY_UBI_AQUA <= EARTH_UBI_CAP_PER_ACCOUNT;
  return { entitled, paid, funded, canClaim: entitled && funded && withinLifetime && !paid, amount: WEEKLY_UBI_AQUA.toString(), productionEnabled: false as const };
}
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function genesisState(genesis: BranchGenesis, trustedAuthority: string): BranchState {
  const { signature, ...content } = genesis;
  requireValue(genesis.mode === "demo" && genesis.domain === "aqua.branchid.genesis.v1" && genesis.authority === trustedAuthority && verifyContent(trustedAuthority, signature, content), "Untrusted bootstrap");
  requireValue(genesis.founders.length === 4 && new Set(genesis.founders.map(f => f.key)).size === 4, "Exactly four distinct founders required");
  requireValue(Number.isSafeInteger(genesis.time) && /^\d+$/.test(genesis.funding), "Invalid bootstrap values");
  const state: BranchState = { community: genesis.community, policy: { ...BRANCH_POLICY }, members: {}, invites: {}, proposals: {}, reviews: {}, claims: {}, received: {}, funding: genesis.funding, processed: [], lastTime: genesis.time };
  genesis.founders.forEach(founder => {
    hex.parse(founder.key);
    const memberId = hashHex({ community: genesis.community, founder: founder.key });
    state.members[memberId] = { id: memberId, key: founder.key, name: founder.name, sponsor: null, root: memberId, depth: 0, admission: hashHex(genesis), status: "admitted", admittedAt: genesis.time, successful: 0, allocation: 20 };
  });
  return state;
}

/** Pure reducer. The caller must establish serial authority; timestamp sorting is not finality. */
function apply(state: BranchState, command: BranchCommand, time: number): BranchState {
  validateBranchCommand(command, state.community);
  requireValue(Number.isSafeInteger(time) && time >= state.lastTime, "Authority clock moved backwards");
  const commandId = hashHex(command);
  requireValue(!state.processed.includes(commandId), "Duplicate command");
  const next = structuredClone(state);
  const member = memberForKey(next, command.key);
  const value = command.body;
  if (value.kind !== "join") requireValue(member?.status === "admitted", "Recognised membership required");
  switch (value.kind) {
    case "invite": {
      requireValue(value.policy === next.policy.version, "Policy changed; create a new invitation");
      requireValue(invitationsAvailable(next, member!) > 0, "Growth gate closed or lifetime invitation allocation exhausted");
      requireValue(Object.keys(next.members).length < next.policy.released, "Released community capacity is full");
      requireValue(!memberForKey(next, value.recipient) && value.recipient !== command.key, "Recipient already belongs to this community");
      requireValue(value.expires > time && value.expires <= time + 30 * 86400000, "Invitation expired or expiry exceeds 30 days");
      next.invites[commandId] = { id: commandId, sponsor: member!.id, recipient: value.recipient, expires: value.expires, policy: value.policy, consumed: null, command };
      break;
    }
    case "join": {
      const invite = next.invites[value.invite];
      requireValue(invite, "Missing invitation dependency; request remains pending");
      requireValue(!member, "Duplicate membership; leaving does not reset identity or quota");
      requireValue(!invite.consumed, "Invitation already consumed");
      requireValue(invite.recipient === command.key, "Invitation is bound to a different recipient key");
      requireValue(time < invite.expires, "Invitation expired");
      requireValue(invite.policy === next.policy.version, "Invitation policy is stale");
      const sponsor = next.members[invite.sponsor]!;
      assertBranchAdmissionCapacity(next, sponsor);
      const memberId = hashHex({ community: next.community, admission: commandId });
      next.members[memberId] = { id: memberId, key: command.key, name: value.name, sponsor: sponsor.id, root: sponsor.root, depth: sponsor.depth + 1, admission: commandId, status: "admitted", admittedAt: time, successful: 0, allocation: 0 };
      sponsor.successful++;
      invite.consumed = memberId;
      break;
    }
    case "propose": {
      requireValue(value.policy === next.policy.version, "Stale policy");
      requireValue(value.depth === next.policy.depth + 1 && value.depth <= next.policy.maxDepth, "Only the next generation can be proposed");
      requireValue(value.capacity === (value.depth === 2 ? 884 : 2500), "Capacity must match the bounded tranche");
      requireValue(!Object.values(next.proposals).some(p => p.result === "open"), "A competing growth proposal is already open; close it first");
      const sponsors = Object.values(next.members).filter(m => m.status === "admitted" && m.depth === value.depth - 1).sort((a, b) => a.id.localeCompare(b.id));
      requireValue(sponsors.length, "No eligible sponsors in the previous generation");
      const remaining = value.capacity - next.policy.released;
      const allocations = allocateBranchTranche(sponsors.map(s => s.id), remaining, next.policy.ordinaryQuota);
      next.proposals[commandId] = { id: commandId, author: member!.id, rationale: value.rationale, policy: next.policy.version, depth: value.depth, capacity: value.capacity, snapshot: Object.values(next.members).filter(m => m.status === "admitted").map(m => m.id).sort(), allocations, closes: time + next.policy.windowMs, votes: {}, result: "open" };
      break;
    }
    case "ballot": {
      const proposal = next.proposals[value.proposal];
      requireValue(proposal && proposal.result === "open" && time < proposal.closes, "Voting is closed or proposal missing");
      requireValue(proposal.snapshot.includes(member!.id), "Not in the voter snapshot");
      requireValue(!proposal.votes[member!.id], "One vote per member; ballot already recorded");
      proposal.votes[member!.id] = value.choice;
      break;
    }
    case "close": {
      const proposal = next.proposals[value.proposal];
      requireValue(proposal && proposal.result === "open" && time >= proposal.closes, "Proposal is missing, already closed or still voting");
      const votes = Object.values(proposal.votes);
      const yes = votes.filter(v => v === "yes").length;
      const no = votes.filter(v => v === "no").length;
      const approved = votes.length >= Math.ceil(proposal.snapshot.length * next.policy.quorumPercent / 100) && yes > no && proposal.policy === next.policy.version;
      proposal.result = approved ? "approved" : "failed";
      if (approved) {
        next.policy.version++;
        next.policy.depth = proposal.depth;
        next.policy.released = proposal.capacity;
        for (const [sponsor, allocation] of Object.entries(proposal.allocations)) next.members[sponsor]!.allocation = allocation;
        proposal.authorization = commandId;
      }
      break;
    }
    case "review": {
      requireValue(next.members[value.subject], "Review subject missing");
      next.reviews[commandId] = { id: commandId, subject: value.subject, reporter: member!.id, evidence: value.evidence, openedAt: time, responses: [] };
      break;
    }
    case "response": {
      const review = next.reviews[value.review];
      requireValue(review && review.subject === member!.id, "Only the subject can respond or appeal");
      review.responses.push({ member: member!.id, text: value.text, appeal: value.appeal });
      break;
    }
    case "resolve": {
      const review = next.reviews[value.review];
      requireValue(review?.reporter === member!.id, "Only the reporter may close their observation without sanctions");
      review.decision = value.text;
      break;
    }
    case "leave": member!.status = "left"; break;
    case "claim": {
      requireValue(value.period === branchPeriod(time), "Claim period is not current");
      requireValue(branchEligibility(next, command.key, time).canClaim, "Claim already paid, unfunded or ineligible");
      next.claims[`${member!.id}:${value.period}`] = commandId;
      next.received[member!.id] = (BigInt(next.received[member!.id] ?? "0") + WEEKLY_UBI_AQUA).toString();
      next.funding = (BigInt(next.funding) - WEEKLY_UBI_AQUA).toString();
      break;
    }
  }
  next.processed.push(commandId);
  next.lastTime = time;
  return next;
}

export function replayBranch(archive: BranchArchive, trustedAuthority: string): BranchState {
  requireValue(archive.version === 1, "Unsupported BranchID archive");
  let state = genesisState(archive.genesis, trustedAuthority);
  let previous = hashHex(archive.genesis);
  archive.receipts.forEach((receipt, index) => {
    const { signature, ...content } = receipt;
    requireValue(receipt.sequence === index + 1 && receipt.previous === previous && verifyContent(trustedAuthority, signature, content), "Missing, reordered or invalid authority receipt");
    state = apply(state, receipt.command, receipt.time);
    requireValue(hashHex(state) === receipt.stateHash, "State commitment mismatch");
    previous = hashHex(receipt);
  });
  return state;
}

/** Deliberately demo-only. No network endpoint or production entitlement capability. */
export class BranchDemoAuthority {
  private current: BranchState;
  private history: BranchArchive;
  private failures: { time: number; reason: string }[] = [];
  constructor(private readonly pair: { publicKey: string; privateKey: string }, archive: BranchArchive) {
    this.current = replayBranch(archive, pair.publicKey);
    this.history = structuredClone(archive);
  }
  get state(): BranchState { return structuredClone(this.current); }
  get archive(): BranchArchive { return structuredClone(this.history); }
  get admissionFailures(): { time: number; reason: string }[] { return structuredClone(this.failures); }
  submit(command: BranchCommand, time: number): BranchReceipt {
    const prior = this.history.receipts.find(r => hashHex(r.command) === hashHex(command));
    if (prior) return structuredClone(prior);
    let next: BranchState;
    try { next = apply(this.current, command, time); }
    catch (error) {
      if (command.body?.kind === "join") this.failures = [...this.failures, { time, reason: error instanceof Error ? error.message : "Invalid admission" }].slice(-100);
      throw error;
    }
    const content = { sequence: this.history.receipts.length + 1, previous: hashHex(this.history.receipts.at(-1) ?? this.history.genesis), time, command, stateHash: hashHex(next) };
    const receipt = { ...content, signature: signContent(this.pair.privateKey, content) };
    this.history.receipts.push(receipt);
    this.current = next;
    return structuredClone(receipt);
  }
}
export function createBranchDemo(time = Date.now()) {
  const authority = createKeyPair();
  const people = ["Maya", "River", "Jules", "Sage", "You"].map(name => ({ ...createKeyPair(), name }));
  const content = { domain: "aqua.branchid.genesis.v1" as const, mode: "demo" as const, community: `aqua-demo-${crypto.randomUUID()}`, authority: authority.publicKey, founders: people.slice(0, 4).map(({ name, publicKey }) => ({ name, key: publicKey })), time, funding: (WEEKLY_UBI_AQUA * 4n).toString() };
  const genesis = { ...content, signature: signContent(authority.privateKey, content) };
  return { authority: new BranchDemoAuthority(authority, { version: 1, genesis, receipts: [] }), people, time };
}

export function branchDiagnostics(state: BranchState, now: number) {
  const windowMs = 86400000;
  const recent = Object.values(state.members).filter(m => m.sponsor && m.admittedAt > now - windowMs);
  const largest = Math.max(0, ...Object.values(state.members).map(m => m.successful));
  const roots = Object.values(state.members).filter(m => m.depth === 0);
  const subtree = Math.max(0, ...roots.map(root => Object.values(state.members).filter(m => m.root === root.id).length));
  return { windowMs, recentAdmissions: recent.length, largestDirectBranch: largest, largestSubtree: subtree, observations: [recent.length >= 10 ? `${recent.length} admissions in 24 hours; ask about onboarding activity.` : "No rapid-admission threshold reached in the last 24 hours.", largest >= 10 ? `Largest direct branch has ${largest} admissions; concentration can reflect ordinary community activity.` : "No direct branch has reached the review threshold.", `Largest founder subtree: ${subtree} of ${Object.keys(state.members).length} lifetime memberships. This may reflect uneven onboarding, not fraud.`], uncertainty: "Observations are not proof of fraud. No rights, payments or expansion permissions change.", voteBreakdowns: null };
}
