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
  createdAt: string;
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
  eligible: string[];
  createdAt: string;
};

type Pool = {
  poolId: string;
  roomId: string;
  maintainer: string;
  reserve: bigint;
  minted: bigint;
  history: string[];
  unminted: Map<string, bigint>;
  redeemable: Map<string, bigint>;
};

export type ReplayState = {
  accepted: AquaEvent[];
  pending: AquaEvent[];
  rejected: RejectedEvent[];
  identities: Map<string, Identity>;
  wallets: Map<string, Wallet>;
  ubiClaims: Set<string>;
  ubiPayments: Map<string, { earth: bigint; sump: bigint; total: bigint }>;
  sump: bigint;
  earthRemaining: bigint;
  rooms: Map<string, Room>;
  proposals: Map<string, Proposal>;
  pools: Map<string, Pool>;
  autoProposals: string[];
};

export function createEmptyState(genesisEarthSupply = GENESIS_EARTH_SUPPLY): ReplayState {
  return {
    accepted: [],
    pending: [],
    rejected: [],
    identities: new Map(),
    wallets: new Map(),
    ubiClaims: new Set(),
    ubiPayments: new Map(),
    sump: 0n,
    earthRemaining: genesisEarthSupply,
    rooms: new Map(),
    proposals: new Map(),
    pools: new Map(),
    autoProposals: []
  };
}

export function replayEvents(events: AquaEvent[], options: { genesisEarthSupply?: bigint } = {}): ReplayState {
  const state = createEmptyState(options.genesisEarthSupply);
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

  // Propagate missing dependencies regardless of incoming bundle order.
  let removed = true;
  while (removed) {
    removed = false;
    for (const event of valid.values()) if (event.parents.some(parent => !valid.has(parent))) {
      state.pending.push(event); valid.delete(event.eventId); removed = true;
    }
  }

  if (hasCycle(valid)) {
    for (const event of valid.values()) state.rejected.push({ event, reason: "Cycle detected" });
    return state;
  }

  const ordered = topoSort(valid);
  const acceptedIds = new Set<string>();
  for (const event of ordered) {
    try {
      if (event.parents.some(parent => !acceptedIds.has(parent))) throw new Error("Rejected parent dependency");
      applyEvent(state, event);
      state.accepted.push(event);
      acceptedIds.add(event.eventId);
    } catch (error) {
      state.rejected.push({ event, reason: error instanceof Error ? error.message : "Replay rejected event" });
    }
  }
  return state;
}

/** Incremental application for an already validated, append-only authority log. */
export function applyConfirmedEvent(state: ReplayState, event: AquaEvent): ReplayState {
  validateEnvelope(event); parsePayload(event);
  if (state.accepted.some(item => item.eventId === event.eventId)) return state;
  if (state.pending.length || state.rejected.length) throw new Error("Cannot append to invalid or pending authority history");
  const parents = new Set(state.accepted.map(item => item.eventId));
  if (event.parents.some(parent => !parents.has(parent))) throw new Error("Missing parent dependency; sync and retry");
  if (state.accepted.some(item => compareEvents(item,event) > 0)) throw new Error("Event would reorder committed history; sync and create a fresh event");
  const next: ReplayState = structuredClone({ ...state, accepted: [], pending: [], rejected: [] });
  next.accepted = [...state.accepted];
  applyEvent(next,event);
  next.accepted.push(structuredClone(event));
  return next;
}

function topoSort(events: Map<string, AquaEvent>): AquaEvent[] {
  const visited = new Set<string>(); const result: AquaEvent[] = [];
  for (const root of [...events.values()].sort(compareEvents)) {
    const stack: { event: AquaEvent; expanded: boolean }[] = [{ event: root, expanded: false }];
    while (stack.length) {
      const { event, expanded } = stack.pop()!;
      if (expanded) { result.push(event); continue; }
      if (visited.has(event.eventId)) continue;
      visited.add(event.eventId); stack.push({ event, expanded: true });
      for (const parent of [...event.parents].sort().reverse()) { const dependency = events.get(parent); if (dependency) stack.push({ event: dependency, expanded: false }); }
    }
  }
  return result;
}
function compareEvents(a: AquaEvent, b: AquaEvent): number { return a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId); }
function hasCycle(events: Map<string, AquaEvent>): boolean {
  const counts = new Map<string, number>(); const children = new Map<string, string[]>(); const ready: string[] = [];
  for (const event of events.values()) {
    const parents = [...new Set(event.parents)].filter(id => events.has(id)); counts.set(event.eventId, parents.length);
    if (!parents.length) ready.push(event.eventId);
    for (const parent of parents) { const list = children.get(parent) ?? []; list.push(event.eventId); children.set(parent,list); }
  }
  for (let index=0; index<ready.length; index++) for (const child of children.get(ready[index]!) ?? []) { const count=counts.get(child)!-1; counts.set(child,count); if (!count) ready.push(child); }
  return ready.length !== events.size;
}

function applyEvent(state: ReplayState, event: AquaEvent): void {
  if (event.type !== "identity.created" && !event.type.startsWith("node.")) {
    const identity = state.identities.get(event.author);
    if (!identity || identity.publicKey !== event.publicKey) throw new Error("Author signing key does not match registered identity");
    const payload = parsePayload(event) as Record<string, unknown>;
    const actorField = event.type === "identity.verified" || event.type === "money.ubi_claimed" || event.type === "chat.member_joined" || event.type.startsWith("dex.pool_") && event.type !== "dex.pool_created" ? "userId"
      : event.type === "chat.room_created" ? "creator" : event.type === "dex.pool_created" ? "maintainer"
      : event.type === "governance.vote_cast" ? "voter"
      : event.type === "money.transfer" || event.type.startsWith("chat.") || event.type.startsWith("governance.proxy_") ? "from" : null;
    if (actorField && payload[actorField] !== event.author) throw new Error("Payload actor does not match signed author");
  }
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
  if ([...state.identities.values()].some(identity => identity.publicKey === event.publicKey)) throw new Error("Signing key already owns an identity");
  state.identities.set(payload.userId, {
    userId: payload.userId,
    publicKey: event.publicKey,
    level: payload.verificationLevel,
    emailHash: payload.emailHash,
    createdAt: event.createdAt
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
  const prior = state.ubiPayments.get(key) ?? { earth: 0n, sump: 0n, total: 0n };
  const account = wallet(state, payload.userId);
  const earthRoom = EARTH_UBI_CAP_PER_ACCOUNT - account.earthReceived;
  let paid = WEEKLY_UBI_AQUA - prior.total;
  const owed = paid;
  const fromEarth = minBigint(paid, earthRoom, state.earthRemaining);
  account.earthReceived += fromEarth;
  state.earthRemaining -= fromEarth;
  paid -= fromEarth;
  if (paid > 0n) {
    const fromSump = minBigint(paid, state.sump);
    state.sump -= fromSump;
    paid = fromEarth + fromSump;
    if (fromSump < owed - fromEarth && !state.autoProposals.includes(`funding-shortfall:${payload.epoch}`)) state.autoProposals.push(`funding-shortfall:${payload.epoch}`);
  } else {
    paid = fromEarth;
  }
  account.balance += paid;
  const total = prior.total + paid;
  state.ubiPayments.set(key, { earth: prior.earth + fromEarth, sump: prior.sump + paid - fromEarth, total });
  if (total === WEEKLY_UBI_AQUA) state.ubiClaims.add(key);
}

function applyTransfer(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { from: string; to: string; amountMinor: string };
  requireVerified(state, payload.from);
  if (event.author !== payload.from) throw new Error("Transfer author mismatch");
  const amount = BigInt(payload.amountMinor);
  if (amount <= 0n) throw new Error("Invalid transfer amount");
  const sender = wallet(state, payload.from);
  if (!state.identities.has(payload.to)) throw new Error("Recipient identity is not registered");
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
  if (payload.prevHash !== room.lastHash) throw new Error("Invalid prevHash");
  checkNonce(room, payload.from, payload.nonce);
  room.messages.push(event.eventId);
  room.lastHash = hashHex({ prev: room.lastHash, id: event.eventId });
}

function applyChatTransfer(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { roomId: string; from: string; to: string; amountMinor: string; nonce: number; prevHash: string; asset: string };
  const room = requireRoomMember(state, payload.roomId, payload.from);
  if (!room.members.has(payload.to)) throw new Error("Room recipient is not a member");
  if (payload.prevHash !== room.lastHash) throw new Error("Invalid prevHash");
  if (room.nonces.get(payload.from)?.has(payload.nonce)) throw new Error("Duplicate nonce");
  if (payload.asset === "AQUA") {
    applyTransfer(state, event);
    checkNonce(room, payload.from, payload.nonce);
    room.messages.push(event.eventId);
    room.lastHash = hashHex({ prev: room.lastHash, id: event.eventId });
    return;
  }
  const amount = BigInt(payload.amountMinor);
  const fromBalance = room.balances.get(payload.from) ?? 0n;
  if (fromBalance < amount) throw new Error("Insufficient room credits");
  checkNonce(room, payload.from, payload.nonce);
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
  if (Date.parse(payload.closesAt) <= Date.parse(event.createdAt)) throw new Error("Proposal must close after opening");
  state.proposals.set(payload.proposalId, {
    proposalId: payload.proposalId,
    title: payload.title,
    closesAt: payload.closesAt,
    votes: new Map(),
    proxies: new Map(),
    revoked: new Set(),
    committee: [],
    eligible: [...state.identities.values()].filter(identity => identity.level === "pohw_lite" || identity.level === "beta_override").map(identity => identity.userId).sort(),
    createdAt: event.createdAt
  });
}

function applyVote(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { proposalId: string; voter: string; choice: VoteChoice };
  requireVerified(state, payload.voter);
  if (event.author !== payload.voter) throw new Error("Vote author mismatch");
  const proposal = state.proposals.get(payload.proposalId);
  if (!proposal) throw new Error("Unknown proposal");
  requireOpenProposal(proposal, event, payload.voter);
  if (proposal.votes.has(payload.voter)) throw new Error("Duplicate vote");
  proposal.votes.set(payload.voter, payload.choice);
}

function applyProxy(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { from: string; to: string; proposalId?: string };
  requireVerified(state, payload.from);
  requireVerified(state, payload.to);
  const proposal = payload.proposalId ? state.proposals.get(payload.proposalId) : firstProposal(state);
  if (!proposal) throw new Error("No proposal available for proxy tracking");
  requireOpenProposal(proposal, event, payload.from);
  if (!proposal.eligible.includes(payload.to)) throw new Error("Proxy is not in voter snapshot");
  if (wouldLoop(proposal, payload.from, payload.to)) throw new Error("Proxy loop rejected");
  proposal.proxies.set(payload.from, { to: payload.to, proposalId: payload.proposalId });
}

function applyProxyRevoke(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { from: string; proposalId?: string };
  const proposal = payload.proposalId ? state.proposals.get(payload.proposalId) : firstProposal(state);
  if (!proposal) throw new Error("No proposal available for proxy revoke");
  requireOpenProposal(proposal, event, payload.from);
  proposal.proxies.delete(payload.from);
  proposal.revoked.add(payload.from);
}

function firstProposal(state: ReplayState): Proposal | undefined {
  return [...state.proposals.values()][0];
}
function requireOpenProposal(proposal: Proposal, event: AquaEvent, voter: string): void {
  if (!proposal.eligible.includes(voter)) throw new Error("Voter not in proposal snapshot");
  if (Date.parse(event.createdAt) < Date.parse(proposal.createdAt) || Date.parse(event.createdAt) >= Date.parse(proposal.closesAt)) throw new Error("Voting is closed");
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
  for (const userId of proposal.eligible) {
    const direct = proposal.votes.get(userId);
    const proxied = direct ?? resolveProxyVote(proposal, userId);
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
  if (state.pools.has(payload.poolId)) throw new Error("Duplicate pool");
  if ([...state.pools.values()].some(pool => pool.roomId === payload.roomId)) throw new Error("Only one reserve pool per room is supported");
  requireRoomMember(state, payload.roomId, payload.maintainer);
  state.pools.set(payload.poolId, { ...payload, reserve: 0n, minted: 0n, history: [event.eventId], unminted: new Map(), redeemable: new Map() });
}

function applyPoolDeposit(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; userId: string; amountMinor: string };
  const pool = requirePool(state, payload.poolId);
  const amount = BigInt(payload.amountMinor);
  const account = wallet(state, payload.userId);
  if (account.balance < amount) throw new Error("Insufficient Aqua for pool deposit");
  account.balance -= amount;
  pool.reserve += amount;
  pool.unminted.set(payload.userId, (pool.unminted.get(payload.userId) ?? 0n) + amount);
  pool.history.push(event.eventId);
}

function applyPoolMint(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; userId: string; amountMinor: string };
  const pool = requirePool(state, payload.poolId);
  const amount = BigInt(payload.amountMinor);
  if (pool.minted + amount > pool.reserve) throw new Error("Mint exceeds pool reserve");
  if ((pool.unminted.get(payload.userId) ?? 0n) < amount) throw new Error("Mint exceeds your unminted deposit");
  const room = requireRoomMember(state, pool.roomId, payload.userId);
  pool.minted += amount;
  pool.unminted.set(payload.userId, pool.unminted.get(payload.userId)! - amount);
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
  pool.redeemable.set(payload.userId, (pool.redeemable.get(payload.userId) ?? 0n) + amount);
  pool.history.push(event.eventId);
}

function applyPoolRelease(state: ReplayState, event: AquaEvent): void {
  const payload = parsePayload(event) as { poolId: string; userId: string; amountMinor: string };
  const pool = requirePool(state, payload.poolId);
  const amount = BigInt(payload.amountMinor);
  if (pool.reserve < amount || pool.reserve - amount < pool.minted) throw new Error("Release exceeds free reserve");
  const redeemable = pool.redeemable.get(payload.userId) ?? 0n;
  const unminted = pool.unminted.get(payload.userId) ?? 0n;
  if (redeemable + unminted < amount) throw new Error("Release exceeds your deposit or burned credits");
  const redeemed = minBigint(redeemable, amount);
  pool.redeemable.set(payload.userId, redeemable - redeemed);
  pool.unminted.set(payload.userId, unminted - (amount - redeemed));
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
