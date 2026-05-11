export const LEVEL_0_EMAIL = 'LEVEL_0_EMAIL';
export const LEVEL_1_POHW = 'LEVEL_1_POHW';
export const LEVEL_2_FULL = 'LEVEL_2_FULL';
export const BETA_OVERRIDE = 'BETAoverride';
export const FIRE_RATE = 0.04;

export function initialState(options = {}) {
  return {
    now: options.now ?? Date.now(),
    events: [],
    rejected: [],
    identities: new Map(),
    emailIndex: new Map(),
    money: {
      earth: 0,
      sump: 0,
      aqua: new Map(),
      firePaid: new Map(),
      locked: new Map()
    },
    governance: {
      proposals: new Map(),
      votes: new Map(),
      proxies: new Map(),
      committeeOptIn: new Set(),
      committees: new Map()
    },
    dex: {
      quotes: new Map(),
      escrows: new Map(),
      witnesses: new Map(),
      cancels: new Map()
    },
    chat: {
      rooms: new Map(),
      joins: new Map(),
      messages: [],
      credits: new Map()
    }
  };
}

export function applyEvent(event, state) {
  const next = state;
  next.events.push(event);
  if (event.module === 'identity') applyIdentity(event, next);
  if (event.module === 'money') applyMoney(event, next);
  if (event.module === 'governance') applyGovernance(event, next);
  if (event.module === 'dex') applyDex(event, next);
  if (event.module === 'chat') applyChat(event, next);
  return next;
}

export function replayEvents(events, options = {}) {
  const state = initialState(options);
  for (const event of [...events].sort(compareEvents)) applyEvent(event, state);
  return state;
}

export function getIdentity(state, userId) {
  return state.identities.get(userId) ?? {
    userId,
    level: undefined,
    emailHash: undefined,
    betaOverride: undefined,
    isVerified: false,
    betaOverrideActive: false
  };
}

export function getAquaBalance(state, userId) {
  return round(state.money.aqua.get(userId) ?? 0);
}

export function getGovernanceState(state) {
  return state.governance;
}

export function getEscrowState(state) {
  return state.dex.escrows;
}

export function isVerifiedIdentity(state, userId) {
  const identity = getIdentity(state, userId);
  return identity.level === LEVEL_1_POHW || identity.level === LEVEL_2_FULL || isActiveBetaOverride(state, userId);
}

export function isActiveBetaOverride(state, userId) {
  const identity = state.identities.get(userId);
  return !!identity?.betaOverride && identity.betaOverride.expiresAt > state.now;
}

export function tallyProposal(state, proposalId) {
  const tally = {};
  const counted = {};
  const directVotes = state.governance.votes.get(proposalId) ?? new Map();
  const verified = [...state.identities.keys()].filter((userId) => isVerifiedIdentity(state, userId)).sort();

  for (const voter of verified) {
    const direct = directVotes.get(voter);
    if (direct) {
      tally[direct.payload.choice] = (tally[direct.payload.choice] ?? 0) + 1;
      counted[voter] = `direct:${direct.payload.choice}`;
      continue;
    }
    const proxy = state.governance.proxies.get(voter);
    const proxyVote = proxy ? directVotes.get(proxy) : undefined;
    if (proxyVote) {
      tally[proxyVote.payload.choice] = (tally[proxyVote.payload.choice] ?? 0) + 1;
      counted[voter] = `proxy:${proxy}:${proxyVote.payload.choice}`;
    }
  }

  return { proposalId, tally, counted, verifiedHumans: verified.length };
}

export function deterministicCommittee(roundId, priorEventHash, eligibleUserIds, count) {
  const seed = `${roundId}|${priorEventHash}|${[...eligibleUserIds].sort().join('|')}`;
  return [...eligibleUserIds]
    .sort((a, b) => simpleHash(`${seed}|${a}`).localeCompare(simpleHash(`${seed}|${b}`)))
    .slice(0, count);
}

function applyIdentity(event, state) {
  let identity = state.identities.get(event.author) ?? { userId: event.author, level: undefined, betaOverrideActive: false, isVerified: false };
  if (event.type === 'identity.email_claim') {
    identity = { ...identity, emailHash: event.payload.emailHash, emailClaimedAt: event.payload.createdAt, level: identity.level ?? LEVEL_0_EMAIL };
    state.emailIndex.set(event.payload.emailHash, event.author);
  }
  if (event.type === 'identity.pohw_simple') {
    identity = { ...identity, emailHash: event.payload.emailHash, pohw: event.payload, level: LEVEL_1_POHW };
  }
  if (event.type === 'identity.beta_override') {
    identity = { ...identity, betaOverride: event.payload, level: identity.level ?? LEVEL_0_EMAIL };
  }
  identity.betaOverrideActive = !!identity.betaOverride && identity.betaOverride.expiresAt > state.now;
  identity.isVerified = identity.level === LEVEL_1_POHW || identity.level === LEVEL_2_FULL || identity.betaOverrideActive;
  state.identities.set(event.author, identity);
}

function applyMoney(event, state) {
  if (event.type === 'money.genesis') state.money.earth = round(event.payload.earthTotal);
  if (event.type === 'money.issue_aqua') {
    if (!event.payload.betaDev) state.money.earth = round(state.money.earth - event.payload.amount);
    add(state.money.aqua, event.payload.to, event.payload.amount);
  }
  if (event.type === 'money.transfer') {
    add(state.money.aqua, event.author, -event.payload.amount);
    add(state.money.aqua, event.payload.to, event.payload.netAmount);
    add(state.money.firePaid, event.author, event.payload.fireAmount);
    state.money.sump = round(state.money.sump + event.payload.fireAmount);
  }
  if (event.type === 'money.sump_distribute') {
    state.money.sump = round(state.money.sump - event.payload.amount);
    add(state.money.aqua, event.payload.to, event.payload.amount);
  }
}

function applyGovernance(event, state) {
  if (event.type === 'governance.proposal_create') state.governance.proposals.set(event.id, event);
  if (event.type === 'governance.vote_cast') {
    if (!state.governance.votes.has(event.payload.proposalId)) state.governance.votes.set(event.payload.proposalId, new Map());
    state.governance.votes.get(event.payload.proposalId).set(event.author, event);
  }
  if (event.type === 'governance.proxy_set') state.governance.proxies.set(event.author, event.payload.proxy);
  if (event.type === 'governance.proxy_revoke') state.governance.proxies.delete(event.author);
  if (event.type === 'governance.committee_opt_in') state.governance.committeeOptIn.add(event.author);
  if (event.type === 'governance.committee_opt_out') state.governance.committeeOptIn.delete(event.author);
  if (event.type === 'governance.committee_select') state.governance.committees.set(event.payload.roundId, event.payload.selected);
}

function applyDex(event, state) {
  if (event.type === 'dex.quote_create') state.dex.quotes.set(event.id, event);
  if (event.type === 'dex.escrow_open') {
    const lockUser = event.payload.lockedFrom ?? event.payload.buyer;
    add(state.money.aqua, lockUser, -event.payload.amount);
    add(state.money.locked, lockUser, event.payload.amount);
    state.dex.escrows.set(event.id, { ...event.payload, id: event.id, lockedFrom: lockUser, witnesses: new Set(), status: 'open' });
  }
  if (event.type === 'dex.witness_attest') {
    if (!state.dex.witnesses.has(event.payload.escrowId)) state.dex.witnesses.set(event.payload.escrowId, new Set());
    state.dex.witnesses.get(event.payload.escrowId).add(event.author);
    const escrow = state.dex.escrows.get(event.payload.escrowId);
    if (escrow) escrow.witnesses.add(event.author);
  }
  if (event.type === 'dex.escrow_release') {
    const escrow = state.dex.escrows.get(event.payload.escrowId);
    if (!escrow) return;
    add(state.money.locked, escrow.lockedFrom, -escrow.amount);
    add(state.money.aqua, event.payload.releaseTo, escrow.amount);
    escrow.status = 'released';
  }
  if (event.type === 'dex.escrow_cancel') {
    if (!state.dex.cancels.has(event.payload.escrowId)) state.dex.cancels.set(event.payload.escrowId, new Set());
    state.dex.cancels.get(event.payload.escrowId).add(event.author);
  }
  if (event.type === 'dex.escrow_refund') {
    const escrow = state.dex.escrows.get(event.payload.escrowId);
    if (!escrow) return;
    add(state.money.locked, escrow.lockedFrom, -escrow.amount);
    add(state.money.aqua, escrow.lockedFrom, escrow.amount);
    escrow.status = 'refunded';
  }
}

function applyChat(event, state) {
  if (event.type === 'chat.room_create') state.chat.rooms.set(event.payload.roomId, event);
  if (event.type === 'chat.room_join') {
    if (!state.chat.joins.has(event.payload.roomId)) state.chat.joins.set(event.payload.roomId, new Set());
    state.chat.joins.get(event.payload.roomId).add(event.author);
  }
  if (event.type === 'chat.message_send') state.chat.messages.push(event);
  if (event.type === 'chat.room_credit_issue') add(roomCredits(state, event.payload.roomId), event.payload.to, event.payload.amount);
  if (event.type === 'chat.room_credit_transfer') {
    const credits = roomCredits(state, event.payload.roomId);
    add(credits, event.author, -event.payload.amount);
    add(credits, event.payload.to, event.payload.amount);
  }
}

function roomCredits(state, roomId) {
  if (!state.chat.credits.has(roomId)) state.chat.credits.set(roomId, new Map());
  return state.chat.credits.get(roomId);
}

export function add(map, key, amount) {
  map.set(key, round((map.get(key) ?? 0) + amount));
}

export function round(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

export function compareEvents(a, b) {
  return a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id));
}

function simpleHash(value) {
  let out = 2166136261;
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return String(out >>> 0).padStart(10, '0');
}
