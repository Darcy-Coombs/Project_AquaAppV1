import { BASE_PROTOCOL, MODULE_VERSION, normalizeEvent, verifyEventHash, verifyEventSignature } from './events.js';
import { deterministicCommittee, getAquaBalance, getIdentity, isVerifiedIdentity, round } from './state.js';

export async function validateEvent(event, state) {
  const normalized = normalizeEvent(event);
  const base = await validateBase(normalized, state);
  if (!base.ok) return base;
  if (normalized.module === 'identity') return validateIdentity(normalized, state);
  if (normalized.module === 'money') return validateMoney(normalized, state);
  if (normalized.module === 'governance') return validateGovernance(normalized, state);
  if (normalized.module === 'dex') return validateDex(normalized, state);
  if (normalized.module === 'chat') return validateChat(normalized, state);
  return fail('unknown-module');
}

async function validateBase(event, state) {
  if (event.protocol !== BASE_PROTOCOL) return fail('unsupported-protocol');
  if (event.moduleVersion !== MODULE_VERSION) return fail('unsupported-module-version');
  if (!['identity', 'money', 'governance', 'dex', 'chat'].includes(event.module)) return fail('unknown-module');
  if (!event.type.startsWith(`${event.module}.`)) return fail('type-module-mismatch');
  if (!Number.isFinite(event.createdAt)) return fail('invalid-created-at');
  if (!event.author) return fail('author-required');
  if (!Array.isArray(event.parents) || event.parents.length > 2) return fail('invalid-parents');
  if (!event.parents.every((id) => state.events.some((prior) => prior.id === id))) return fail('unknown-parent');
  if (!await verifyEventHash(event)) return fail('event-hash-invalid');
  if (!await verifyEventSignature(event, event.author)) return fail('event-signature-invalid');
  return { ok: true };
}

function validateIdentity(event, state) {
  if (event.type === 'identity.claim') {
    if (typeof event.payload.name !== 'string' || !event.payload.name.trim()) return fail('identity-name-required');
    return { ok: true };
  }
  if (event.type === 'identity.pohw_attest') {
    if (typeof event.payload.subject !== 'string' || !event.payload.subject) return fail('pohw-subject-required');
    if (!['unverified', 'locally_verified', 'vouched', 'challenged', 'archived'].includes(event.payload.status)) return fail('invalid-pohw-status');
    return { ok: true };
  }
  if (event.type === 'identity.email_claim') {
    if (!hex(event.payload.emailHash)) return fail('email-hash-required');
    if (!Number.isFinite(event.payload.createdAt)) return fail('email-created-at-required');
    return { ok: true };
  }
  if (event.type === 'identity.pohw_simple') {
    if (!hex(event.payload.emailHash)) return fail('email-hash-required');
    if (!event.payload.challengeText || !hex(event.payload.responseHash)) return fail('pohw-response-required');
    if (event.payload.method !== 'simple-beta-pohw') return fail('invalid-pohw-method');
    if (!positive(event.payload.score)) return fail('invalid-pohw-score');
    return { ok: true };
  }
  if (event.type === 'identity.beta_override') {
    if (!hex(event.payload.codeHash)) return fail('override-code-hash-required');
    if (event.payload.reason !== 'beta testing only') return fail('invalid-override-reason');
    if (!Number.isFinite(event.payload.expiresAt) || event.payload.expiresAt <= state.now) return fail('override-expired');
    return { ok: true };
  }
  return fail('identity-type-not-allowed');
}

function validateMoney(event, state) {
  if (event.type === 'money.genesis') {
    if (!positive(event.payload.earthTotal)) return fail('invalid-earth-total');
    if (state.events.some((item) => item.type === 'money.genesis')) return fail('duplicate-genesis');
    return { ok: true };
  }
  if (event.type === 'money.issue_aqua') {
    if (!isVerifiedIdentity(state, event.payload.to)) return fail('issue-recipient-not-verified');
    if (!positive(event.payload.amount)) return fail('invalid-issue-amount');
    if (!event.payload.betaDev && state.money.earth < event.payload.amount) return fail('insufficient-earth');
    return { ok: true };
  }
  if (event.type === 'money.transfer') {
    if (event.payload.from && event.payload.from !== event.author) return fail('transfer-from-author-mismatch');
    if (!event.payload.to) return fail('transfer-recipient-required');
    if (!positive(event.payload.amount)) return fail('invalid-transfer-amount');
    const fire = round(event.payload.amount * 0.04);
    if (round(event.payload.fireAmount) !== fire) return fail('invalid-fire-amount');
    if (round(event.payload.netAmount) !== round(event.payload.amount - fire)) return fail('invalid-net-amount');
    if (getAquaBalance(state, event.author) < event.payload.amount) return fail('insufficient-balance');
    return { ok: true };
  }
  if (event.type === 'money.sump_distribute') {
    if (!isVerifiedIdentity(state, event.payload.to)) return fail('sump-recipient-not-verified');
    if (!positive(event.payload.amount)) return fail('invalid-sump-amount');
    if (state.money.sump < event.payload.amount) return fail('insufficient-sump');
    return { ok: true };
  }
  return fail('money-type-not-allowed');
}

function validateGovernance(event, state) {
  if (event.type === 'governance.proposal_create') {
    if (!isVerifiedIdentity(state, event.author)) return fail('proposal-author-not-verified');
    if (!event.payload.title) return fail('proposal-title-required');
    if (!Array.isArray(event.payload.choices) || event.payload.choices.length < 2) return fail('proposal-choices-required');
    return { ok: true };
  }
  if (event.type === 'governance.vote_cast') {
    const proposal = state.governance.proposals.get(event.payload.proposalId);
    if (!isVerifiedIdentity(state, event.author)) return fail('vote-author-not-verified');
    if (!proposal) return fail('proposal-not-found');
    if (!proposal.payload.choices.includes(event.payload.choice)) return fail('invalid-vote-choice');
    return { ok: true };
  }
  if (event.type === 'governance.proxy_set') {
    if (!isVerifiedIdentity(state, event.author)) return fail('proxy-author-not-verified');
    if (!isVerifiedIdentity(state, event.payload.proxy)) return fail('proxy-target-not-verified');
    if (event.payload.proxy === event.author) return fail('self-proxy-not-allowed');
    return { ok: true };
  }
  if (event.type === 'governance.proxy_revoke') {
    if (!isVerifiedIdentity(state, event.author)) return fail('proxy-author-not-verified');
    return { ok: true };
  }
  if (event.type === 'governance.committee_opt_in' || event.type === 'governance.committee_opt_out') {
    if (!isVerifiedIdentity(state, event.author)) return fail('committee-user-not-verified');
    return { ok: true };
  }
  if (event.type === 'governance.committee_select') {
    const eligible = [...state.governance.committeeOptIn].filter((userId) => isVerifiedIdentity(state, userId)).sort();
    const expected = deterministicCommittee(event.payload.roundId, event.payload.priorEventHash, eligible, event.payload.count);
    if (JSON.stringify(event.payload.selected) !== JSON.stringify(expected)) return fail('committee-selection-not-reproducible');
    return { ok: true };
  }
  return fail('governance-type-not-allowed');
}

function validateDex(event, state) {
  if (event.type === 'dex.quote_create') {
    if (!['buy', 'sell'].includes(event.payload.side)) return fail('invalid-quote-side');
    if (!positive(event.payload.amount) || !positive(event.payload.price)) return fail('invalid-quote');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_open') {
    const lockedFrom = event.payload.lockedFrom ?? event.payload.buyer;
    if (!event.payload.buyer || !event.payload.seller) return fail('escrow-parties-required');
    if (!positive(event.payload.amount)) return fail('invalid-escrow-amount');
    if (lockedFrom !== event.author) return fail('escrow-author-must-lock-funds');
    if (getAquaBalance(state, lockedFrom) < event.payload.amount) return fail('insufficient-balance');
    return { ok: true };
  }
  if (event.type === 'dex.witness_attest') {
    const escrow = state.dex.escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    if (!isVerifiedIdentity(state, event.author)) return fail('witness-not-verified');
    if (event.author === escrow.buyer || event.author === escrow.seller) return fail('witness-is-party');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_release') {
    const escrow = state.dex.escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    const threshold = escrow.witnessThreshold ?? 1;
    if (escrow.status !== 'open') return fail('escrow-not-open');
    if ((escrow.witnesses?.size ?? 0) < threshold) return fail('witness-threshold-not-met');
    if (!event.payload.releaseTo) return fail('release-recipient-required');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_cancel') {
    const escrow = state.dex.escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    if (![escrow.buyer, escrow.seller].includes(event.author)) return fail('cancel-author-not-party');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_refund') {
    const escrow = state.dex.escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    const cancels = state.dex.cancels.get(event.payload.escrowId) ?? new Set();
    const timedOut = Number.isFinite(escrow.timeoutAt) && escrow.timeoutAt <= state.now;
    const mutual = cancels.has(escrow.buyer) && cancels.has(escrow.seller);
    if (!timedOut && !mutual) return fail('refund-requires-timeout-or-mutual-cancel');
    return { ok: true };
  }
  return fail('dex-type-not-allowed');
}

function validateChat(event, state) {
  const roomId = event.payload.roomId;
  if (event.type === 'chat.room_create') {
    if (!roomId || !/^[a-z0-9][a-z0-9-]{1,48}$/i.test(roomId)) return fail('invalid-room-id');
    return { ok: true };
  }
  if (event.type === 'chat.room_join') {
    if (!state.chat.rooms.has(roomId)) return fail('room-not-found');
    return { ok: true };
  }
  if (event.type === 'chat.message_send' || event.type === 'chat.message_create') {
    if (!state.chat.rooms.has(roomId)) return fail('room-not-found');
    if (!event.payload.text) return fail('message-required');
    return { ok: true };
  }
  if (event.type === 'chat.room_credit_issue' || event.type === 'chat.room_credit_transfer') {
    if (!isVerifiedIdentity(state, event.author) && !event.payload.betaDev) return fail('room-credit-author-not-verified');
    if (!positive(event.payload.amount)) return fail('invalid-room-credit-amount');
    if (event.type === 'chat.room_credit_transfer') {
      const balance = state.chat.credits.get(roomId)?.get(event.author) ?? 0;
      if (balance < event.payload.amount) return fail('insufficient-room-credit');
    }
    return { ok: true };
  }
  return fail('chat-type-not-allowed');
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hex(value) {
  return typeof value === 'string' && /^[0-9a-f]+$/i.test(value);
}

function fail(reason) {
  return { ok: false, reason };
}
