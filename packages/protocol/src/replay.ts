import {
  BASIS_POINTS,
  EARTH_UBI_CAP_PER_ACCOUNT,
  GENESIS_EARTH_SUPPLY,
  PROXY_MAX_DEPTH,
  TRANSACTION_TAX_BASIS_POINTS,
  WEEKLY_UBI_AQUA
} from "@aqua/shared";
import { hashHex } from "./crypto.js";
import { parsePayload, validateEnvelope } from "./events.js";
import type { AquaEvent, IdentityLevel, RejectedEvent, VoteChoice } from "./types.js";

type Identity = {
  userId: string;
  publicKey: string;
  level: IdentityLevel;
  emailHash?: string;
  proofHash?: string;
  verificationMethod?: string;
};

type Wallet = {
  balance: bigint;
  earthReceived: bigint;
  firePaid: bigint;
  sumpContributed: bigint;
};

type Room = {
  roomId: string;
  name: string;
  inviteCodeHash: string;
  members: Set<string>;
  balances: Map<string, bigint>;
  nonces: Map<string, Set<number>>;
  lastHash: string;
  messages: string[];
};

type Proposal = {
  proposalId: string;
  title: string;
  closesAt: string;
  votes: Map<string, VoteChoice>;
  proxies: Map<string, { to: string; proposalId?: string }>;
  revoked: Set<string>;
  committee: string[];
};

type Pool = {
  poolId: string;
  roomId: string;
  maintainer: string;
  reserve: bigint;
  minted: bigint;
  history: string[];
};

export type ReplayState = {
  accepted: AquaEvent[];
  pending: AquaEvent[];
  rejected: RejectedEvent[];
  identities: Map<string, Identity>;
  wallets: Map<string, Wallet>;
  ubiClaims: Set<string>;
  sump: bigint;
  earthRemaining: bigint;
  rooms: Map<string, Room>;
  proposals: Map<string, Proposal>;
  pools: Map<string, Pool>;
  autoProposals: string[];
};

export function createEmptyState(): ReplayState {
  return {
    accepted: [],
    pending: [],
    rejected: [],
    identities: new Map(),
    wallets: new Map(),
    ubiClaims: new Set(),
    sump: 0n,
    earthRemaining: GENESIS_EARTH_SUPPLY,
    rooms: new Map(),
    proposals: new Map(),
    pools: new Map(),
    autoProposals: []
  };
}

export function replayEvents(events: AquaEvent[]): ReplayState {
  const state = createEmptyState();
  const byId = new Map<string, AquaEvent>();
  const valid = new Map<string, AquaEvent>();

  for (const event of events) {
    if (byId.has(event.eventId)) continue;
    byId.set(event.eventId, event);
    try {
      validateEnvelope(event);
      parsePayload(event);
      valid.set(event.eventId, event);
    } catch (error) {
      state.rejected.push({ event, reason: error instanceof Error ? error.message : "Invalid event" });
    }
  }

  for (const event of valid.values()) {
    if (event.parents.some((parent) => !valid.has(parent))) {
      state.pending.push(event);
      valid.delete(event.eventId);
    }
  }

  if (hasCycle(valid)) {
    for (const event of valid.values()) state.rejected.push({ event, reason: "Cycle detected" });
    return state;
  }

  const ordered = topoSort(valid);
  for (const event of ordered) {
    try {
      applyEvent(state, event);
      state.accepted.push(event);
    } catch (error) {
      state.rejected.push({ event, reason: error instanceof Error ? error.message : "Replay rejected event" });
    }
  }
  return state;
}

function topoSort(events: Map<string, AquaEvent>): AquaEvent[] {
  const visited = new Set<string>();
  const result: AquaEvent[] = [];
  const visit = (event: AquaEvent) => {
    if (visited.has(event.eventId)) return;
    visited.add(event.eventId);
    for (const parent of [...event.parents].sort()) {
      const parentEvent = events.get(parent);
      if (parentEvent) visit(parentEvent);
    }
    result.push(event);
  };
  for (const event of [...events.values()].sort(compareEvents)) visit(event);
  return result;
}

function compareEvents(a: AquaEvent, b: AquaEvent): number {
  return a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId);
}

function hasCycle(events: Map<string, AquaEvent>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const parent of events.get(id)?.parents ?? []) {
      if (events.has(parent) && dfs(parent)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...events.keys()].some(dfs);
}

function applyEvent(state: ReplayState, event: AquaEvent): void {
  switch (event.type) {
    case "identity.created": return applyIdentityCreated(state, event);
    case "identity.verified": return applyIdentityVerified(state, event);
    case "money.ubi_claimed": return applyUbi(state, event);
    case "money.transfer": return applyTransfer(state, event);
    case "chat.room_created": return applyRoomCreated(state, event);
    case "chat.member_joined": return applyRoomJoined(state, event);
    case "chat.message": return applyChatMessage(state, event);
    case "chat.transfer": return applyChatTransfer(state, event);
    case "governance.proposal_created": return applyProposal(state, event);
    case "governance.vote_cast": return applyVote(state, event);
    case "governance.proxy_assigned": return applyProxy(state, event);
    case "governance.proxy_revoked": return applyProxyRevoke(state, event);
    case "governance.committee_selected": return applyCommittee(state, event);
    case "dex.pool_created": return applyPoolCreated(state, event);
    case "dex.pool_deposit": return applyPoolDeposit(state, event);
    case "dex.pool_mint_room_credit": return applyPoolMint(state, event);
    case "dex.pool_burn_room_credit": return applyPoolBurn(state, event);
    case "dex.pool_release_aqua": return applyPoolRelease(state, event);
    case "node.peer_seen":
    case "node.snapshot_created": return;
  }
}

function wallet(state: ReplayState, userId: string): Wallet {
  const current = state.wallets.get(userId) ?? { balance: 0n, earthReceived: 0n, firePaid: 0n, sumpContributed: 0n };
  state.wallets.set(userId, current);
  return current;
}

function requireVerified(state: ReplayState, userId: string): Identity {
  const identity = state.identities.get(userId);
  if (!identity || (identity.level !== "pohw_lite" && identity.level !== "beta_override")) {
    throw new Error(`${userId} is not verified`);
  }
  return identity;
}

function applyIdentityCreated(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { userId: string; emailHash?: string; verificationLevel: IdentityLevel };
  if (state.identities.has(payload.userId)) throw new Error("Duplicate identity");
  if (payload.userId !== event.author) throw new Error("Identity author mismatch");
  state.identities.set(payload.userId, {
    userId: payload.userId,
    publicKey: event.publicKey,
    level: payload.verificationLevel,
    emailHash: payload.emailHash
  });
  wallet(state, payload.userId);
}

function applyIdentityVerified(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { userId: string; method: string; proofHash: string; verification_method?: string };
  const identity = state.identities.get(payload.userId);
  if (!identity) throw new Error("Identity must exist before verification");
  if (identity.publicKey !== event.publicKey || event.author !== payload.userId) throw new Error("Verification author mismatch");
  identity.level = payload.method === "BETAoverride" ? "beta_override" : "pohw_lite";
  identity.proofHash = payload.proofHash;
  identity.verificationMethod = payload.verification_method ?? payload.method;
}

function applyUbi(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { userId: string; epoch: string; verification_method: string };
  const identity = requireVerified(state, payload.userId);
  if (event.author !== payload.userId || identity.publicKey !== event.publicKey) throw new Error("UBI author mismatch");
  const key = `${payload.userId}:${payload.epoch}`;
  if (state.ubiClaims.has(key)) throw new Error("Duplicate UBI claim");
  state.ubiClaims.add(key);

  const account = wallet(state, payload.userId);
  const earthRoom = EARTH_UBI_CAP_PER_ACCOUNT - account.earthReceived;
  let paid = WEEKLY_UBI_AQUA;
  const fromEarth = minBigint(paid, earthRoom, state.earthRemaining);
  account.earthReceived += fromEarth;
  state.earthRemaining -= fromEarth;
  paid -= fromEarth;
  if (paid > 0n) {
    const fromSump = minBigint(paid, state.sump);
    state.sump -= fromSump;
    paid = fromEarth + fromSump;
    if (fromSump < WEEKLY_UBI_AQUA - fromEarth) {
      state.autoProposals.push(`amend-fire-tax:${payload.epoch}`);
    }
  } else {
    paid = fromEarth;
  }
  account.balance += paid;
}

function applyTransfer(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { from: string; to: string; amountMinor: string };
  requireVerified(state, payload.from);
  if (event.author !== payload.from) throw new Error("Transfer author mismatch");
  const amount = BigInt(payload.amountMinor);
  if (amount <= 0n) throw new Error("Invalid transfer amount");
  const sender = wallet(state, payload.from);
  if (sender.balance < amount) throw new Error("Insufficient funds");
  const fire = (amount * TRANSACTION_TAX_BASIS_POINTS) / BASIS_POINTS;
  sender.balance -= amount;
  sender.firePaid += fire;
  sender.sumpContributed += fire;
  wallet(state, payload.to).balance += amount - fire;
  state.sump += fire;
}

function applyRoomCreated(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { roomId: string; name: string; inviteCodeHash: string; creator: string };
  if (state.rooms.has(payload.roomId)) throw new Error("Duplicate room");
  state.rooms.set(payload.roomId, {
    ...payload,
    members: new Set([payload.creator]),
    balances: new Map(),
    nonces: new Map(),
    lastHash: "genesis",
    messages: []
  });
}

function applyRoomJoined(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { roomId: string; userId: string; inviteCodeHash: string };
  const room = state.rooms.get(payload.roomId);
  if (!room || room.inviteCodeHash !== payload.inviteCodeHash) throw new Error("Room invite rejected");
  room.members.add(payload.userId);
}

function applyChatMessage(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { roomId: string; from: string; nonce: number; prevHash: string };
  const room = requireRoomMember(state, payload.roomId, payload.from);
  checkNonce(room, payload.from, payload.nonce);
  if (payload.prevHash !== room.lastHash) throw new Error("Invalid prevHash");
  room.messages.push(event.eventId);
  room.lastHash = hashHex({ prev: room.lastHash, id: event.eventId });
}

function applyChatTransfer(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { roomId: string; from: string; to: string; amountMinor: string; nonce: number; prevHash: string };
  const room = requireRoomMember(state, payload.roomId, payload.from);
  if (!room.members.has(payload.to)) throw new Error("Room recipient is not a member");
  checkNonce(room, payload.from, payload.nonce);
  if (payload.prevHash !== room.lastHash) throw new Error("Invalid prevHash");
  const amount = BigInt(payload.amountMinor);
  const fromBalance = room.balances.get(payload.from) ?? 0n;
  if (fromBalance < amount) throw new Error("Insufficient room credits");
  room.balances.set(payload.from, fromBalance - amount);
  room.balances.set(payload.to, (room.balances.get(payload.to) ?? 0n) + amount);
  room.messages.push(event.eventId);
  room.lastHash = hashHex({ prev: room.lastHash, id: event.eventId });
}

function requireRoomMember(state: ReplayState, roomId: string, userId: string): Room {
  const room = state.rooms.get(roomId);
  if (!room || !room.members.has(userId)) throw new Error("User is not invited to room");
  return room;
}

function checkNonce(room: Room, userId: string, nonce: number): void {
  const nonces = room.nonces.get(userId) ?? new Set<number>();
  if (nonces.has(nonce)) throw new Error("Duplicate nonce");
  nonces.add(nonce);
  room.nonces.set(userId, nonces);
}

function applyProposal(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { proposalId: string; title: string; closesAt: string };
  requireVerified(state, event.author);
  if (state.proposals.has(payload.proposalId)) throw new Error("Duplicate proposal");
  state.proposals.set(payload.proposalId, {
    proposalId: payload.proposalId,
    title: payload.title,
    closesAt: payload.closesAt,
    votes: new Map(),
    proxies: new Map(),
    revoked: new Set(),
    committee: []
  });
}

function applyVote(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { proposalId: string; voter: string; choice: VoteChoice };
  requireVerified(state, payload.voter);
  if (event.author !== payload.voter) throw new Error("Vote author mismatch");
  const proposal = state.proposals.get(payload.proposalId);
  if (!proposal) throw new Error("Unknown proposal");
  proposal.votes.set(payload.voter, payload.choice);
}

function applyProxy(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { from: string; to: string; proposalId?: string };
  requireVerified(state, payload.from);
  requireVerified(state, payload.to);
  const proposal = payload.proposalId ? state.proposals.get(payload.proposalId) : firstProposal(state);
  if (!proposal) throw new Error("No proposal available for proxy tracking");
  if (wouldLoop(proposal, payload.from, payload.to)) throw new Error("Proxy loop rejected");
  proposal.proxies.set(payload.from, { to: payload.to, proposalId: payload.proposalId });
}

function applyProxyRevoke(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { from: string; proposalId?: string };
  const proposal = payload.proposalId ? state.proposals.get(payload.proposalId) : firstProposal(state);
  if (!proposal) throw new Error("No proposal available for proxy revoke");
  proposal.proxies.delete(payload.from);
  proposal.revoked.add(payload.from);
}

function firstProposal(state: ReplayState): Proposal | undefined {
  return [...state.proposals.values()][0];
}

function wouldLoop(proposal: Proposal, from: string, to: string): boolean {
  let current: string | undefined = to;
  for (let depth = 0; depth <= PROXY_MAX_DEPTH; depth += 1) {
    if (current === from) return true;
    current = proposal.proxies.get(current)?.to;
    if (!current) return false;
  }
  return true;
}

function applyCommittee(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { proposalId: string; snapshotHash: string; size: number; optedOut: string[] };
  const proposal = state.proposals.get(payload.proposalId);
  if (!proposal) throw new Error("Unknown proposal for committee");
  proposal.committee = selectCommittee(state, payload.snapshotHash, payload.proposalId, payload.size, new Set(payload.optedOut));
}

export function selectCommittee(state: ReplayState, snapshotHash: string, proposalId: string, size: number, optedOut = new Set<string>()): string[] {
  return [...state.identities.values()]
    .filter((identity) => (identity.level === "pohw_lite" || identity.level === "beta_override") && !optedOut.has(identity.userId))
    .map((identity) => ({ userId: identity.userId, score: hashHex({ snapshotHash, proposalId, userId: identity.userId }) }))
    .sort((a, b) => a.score.localeCompare(b.score) || a.userId.localeCompare(b.userId))
    .slice(0, size)
    .map((entry) => entry.userId);
}

export function tallyProposal(state: ReplayState, proposalId: string): Record<VoteChoice, number> {
  const proposal = state.proposals.get(proposalId);
  if (!proposal) return { yes: 0, no: 0, abstain: 0 };
  const totals: Record<VoteChoice, number> = { yes: 0, no: 0, abstain: 0 };
  for (const identity of state.identities.values()) {
    if (identity.level !== "pohw_lite" && identity.level !== "beta_override") continue;
    const direct = proposal.votes.get(identity.userId);
    const proxied = direct ?? resolveProxyVote(proposal, identity.userId);
    if (proxied) totals[proxied] += 1;
  }
  return totals;
}

function resolveProxyVote(proposal: Proposal, userId: string): VoteChoice | undefined {
  let current = proposal.proxies.get(userId)?.to;
  const seen = new Set([userId]);
  for (let depth = 0; depth < PROXY_MAX_DEPTH && current; depth += 1) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    const direct = proposal.votes.get(current);
    if (direct) return direct;
    current = proposal.proxies.get(current)?.to;
  }
  return undefined;
}

function applyPoolCreated(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; roomId: string; maintainer: string };
  requireVerified(state, payload.maintainer);
  if (!state.rooms.has(payload.roomId)) throw new Error("Pool room must exist");
  state.pools.set(payload.poolId, { ...payload, reserve: 0n, minted: 0n, history: [event.eventId] });
}

function applyPoolDeposit(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; userId: string; amountMinor: string };
  const pool = requirePool(state, payload.poolId);
  const amount = BigInt(payload.amountMinor);
  const account = wallet(state, payload.userId);
  if (account.balance < amount) throw new Error("Insufficient Aqua for pool deposit");
  account.balance -= amount;
  pool.reserve += amount;
  pool.history.push(event.eventId);
}

function applyPoolMint(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; userId: string; amountMinor: string };
  const pool = requirePool(state, payload.poolId);
  const amount = BigInt(payload.amountMinor);
  if (pool.minted + amount > pool.reserve) throw new Error("Mint exceeds pool reserve");
  const room = requireRoomMember(state, pool.roomId, payload.userId);
  pool.minted += amount;
  room.balances.set(payload.userId, (room.balances.get(payload.userId) ?? 0n) + amount);
  pool.history.push(event.eventId);
}

function applyPoolBurn(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; userId: string; amountMinor: string };
  const pool = requirePool(state, payload.poolId);
  const amount = BigInt(payload.amountMinor);
  const room = requireRoomMember(state, pool.roomId, payload.userId);
  const balance = room.balances.get(payload.userId) ?? 0n;
  if (balance < amount) throw new Error("Burn exceeds room credit balance");
  room.balances.set(payload.userId, balance - amount);
  pool.minted -= amount;
  pool.history.push(event.eventId);
}

function applyPoolRelease(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; userId: string; amountMinor: string };
  const pool = requirePool(state, payload.poolId);
  const amount = BigInt(payload.amountMinor);
  if (pool.reserve < amount || pool.reserve - amount < pool.minted) throw new Error("Release exceeds free reserve");
  pool.reserve -= amount;
  wallet(state, payload.userId).balance += amount;
  pool.history.push(event.eventId);
}

function requirePool(state: ReplayState, poolId: string): Pool {
  const pool = state.pools.get(poolId);
  if (!pool) throw new Error("Unknown pool");
  return pool;
}

function minBigint(...values: bigint[]): bigint {
  return values.reduce((min, value) => value < min ? value : min);
}
