import { chatState } from '../chat/chat.ts';
import { activeQuotes, dexState } from '../dex/index.ts';
import { governanceState } from '../governance/tally.ts';
import { identityState } from '../identity/identity.ts';
import { canSpend, deriveMoney } from '../money/money.ts';
import { type AquaEvent } from '../protocol/event.ts';

export type ModuleValidationResult = {
  ok: boolean;
  reason?: string;
};

export function validateModuleEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  if (event.module === 'identity') return validateIdentityEvent(event);
  if (event.module === 'money') return validateMoneyEvent(event, appliedEvents);
  if (event.module === 'governance') return validateGovernanceEvent(event, appliedEvents);
  if (event.module === 'dex') return validateDexEvent(event, appliedEvents);
  if (event.module === 'chat') return validateChatEvent(event, appliedEvents);
  return { ok: true };
}

function validateIdentityEvent(event: AquaEvent): ModuleValidationResult {
  if (event.type === 'identity.claim') {
    if (typeof event.payload.name !== 'string') return fail('identity-name-required');
    return { ok: true };
  }
  if (event.type === 'identity.email_claim') {
    if (!hex(event.payload.emailHash)) return fail('email-hash-required');
    if (!Number.isFinite(event.payload.createdAt)) return fail('email-created-at-required');
    return { ok: true };
  }
  if (event.type === 'identity.pohw_attest') {
    if (typeof event.payload.subject !== 'string') return fail('pohw-subject-required');
    if (!['unverified', 'locally_verified', 'vouched', 'challenged', 'archived'].includes(event.payload.status)) return fail('invalid-pohw-status');
    return { ok: true };
  }
  if (event.type === 'identity.pohw_simple') {
    if (!hex(event.payload.emailHash)) return fail('email-hash-required');
    if (event.payload.method !== 'simple-beta-pohw') return fail('invalid-pohw-method');
    if (!hex(event.payload.responseHash)) return fail('pohw-response-required');
    return { ok: true };
  }
  if (event.type === 'identity.beta_override') {
    if (!hex(event.payload.codeHash)) return fail('override-code-hash-required');
    if (event.payload.reason !== 'beta testing only') return fail('invalid-override-reason');
    if (!Number.isFinite(event.payload.expiresAt) || event.payload.expiresAt <= Date.now()) return fail('override-expired');
    return { ok: true };
  }
  return fail('identity-type-not-allowed');
}

function validateMoneyEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  const money = deriveMoney(appliedEvents);
  if (event.type === 'money.issue_aqua') {
    if (!positive(event.payload.amount)) return fail('invalid-issue-amount');
    if (!verifiedIdentities(appliedEvents).includes(event.payload.to)) return fail('issue-recipient-not-verified');
    if (!event.payload.betaDev && money.earthReserve < event.payload.amount) return fail('insufficient-earth');
    return { ok: true };
  }
  if (event.type === 'money.transfer') {
    if (event.payload.from && event.payload.from !== event.author) return fail('transfer-from-author-mismatch');
    if (!positive(event.payload.amount)) return fail('invalid-transfer-amount');
    if (typeof event.payload.to !== 'string' || !event.payload.to) return fail('transfer-recipient-required');
    const fire = round(event.payload.amount * 0.04);
    if (round(event.payload.fireAmount) !== fire) return fail('invalid-fire-amount');
    if (round(event.payload.netAmount) !== round(event.payload.amount - fire)) return fail('invalid-net-amount');
    if (!canSpend(appliedEvents, event.author, event.payload.amount)) return fail('insufficient-balance');
    return { ok: true };
  }
  if (event.type === 'money.genesis') {
    if (!positive(event.payload.earthTotal)) return fail('invalid-earth-total');
    if (appliedEvents.some((item) => item.type === 'money.genesis')) return fail('duplicate-genesis');
    return { ok: true };
  }
  if (event.type === 'money.sump_distribute') {
    if (!verifiedIdentities(appliedEvents).includes(event.payload.to)) return fail('sump-recipient-not-verified');
    if (!positive(event.payload.amount)) return fail('invalid-sump-amount');
    if (money.sump < event.payload.amount) return fail('insufficient-sump');
    return { ok: true };
  }
  return fail('money-type-not-allowed');
}

function validateGovernanceEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  const ids = verifiedIdentities(appliedEvents);
  const gov = governanceState(appliedEvents);

  if (event.type === 'governance.proposal_create') {
    if (!ids.includes(event.author)) return fail('proposal-author-not-verified');
    if (typeof event.payload.title !== 'string' || !event.payload.title.trim()) return fail('proposal-title-required');
  }
  if (event.type === 'governance.vote_cast') {
    const proposal = gov.proposals.get(event.payload.proposalId);
    if (!ids.includes(event.author)) return fail('vote-author-not-verified');
    if (!proposal) return fail('proposal-not-found');
    const choices = Array.isArray(proposal.payload.choices) ? proposal.payload.choices : ['yes', 'no'];
    if (!choices.includes(event.payload.choice)) return fail('invalid-vote-choice');
  }
  if (event.type === 'governance.proxy_set') {
    if (!ids.includes(event.author)) return fail('proxy-author-not-verified');
    if (!ids.includes(event.payload.proxy)) return fail('proxy-target-not-verified');
    if (event.payload.proxy === event.author) return fail('self-proxy-not-allowed');
  }
  if (event.type === 'governance.proxy_revoke' && !ids.includes(event.author)) return fail('proxy-author-not-verified');
  if (event.type === 'governance.committee_opt_in' || event.type === 'governance.committee_opt_out') {
    if (!ids.includes(event.author)) return fail('committee-user-not-verified');
    return { ok: true };
  }
  if (event.type === 'governance.committee_select') {
    const eligible = optedInIdentities(appliedEvents).filter((id) => ids.includes(id)).sort();
    const expected = deterministicCommitteeBeta(event.payload.roundId, event.payload.priorEventHash, eligible, event.payload.count);
    if (JSON.stringify(event.payload.selected) !== JSON.stringify(expected)) return fail('committee-selection-not-reproducible');
    return { ok: true };
  }
  if (event.type === 'governance.outcome_publish') {
    const proposal = gov.proposals.get(event.payload.proposalId);
    if (!ids.includes(event.author)) return fail('outcome-author-not-verified');
    if (!proposal) return fail('proposal-not-found');
  }
  return { ok: true };
}

function validateDexEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  if (event.type === 'dex.quote_create') {
    if (!positive(event.payload.amount) || !positive(event.payload.price)) return fail('invalid-quote');
    if (event.payload.expiresAt <= event.createdAt) return fail('quote-expired-at-create');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_open') {
    const lockedFrom = event.payload.lockedFrom ?? event.payload.buyer;
    if (lockedFrom !== event.author) return fail('escrow-author-must-lock-funds');
    if (!positive(event.payload.amount)) return fail('invalid-escrow-amount');
    if (typeof event.payload.buyer !== 'string' || !event.payload.buyer) return fail('escrow-buyer-required');
    if (typeof event.payload.seller !== 'string' || !event.payload.seller) return fail('escrow-seller-required');
    if (event.payload.quoteId && !activeQuotes(appliedEvents).some((quote) => quote.id === event.payload.quoteId)) return fail('quote-not-active');
    if (!canSpend(appliedEvents, lockedFrom, event.payload.amount)) return fail('insufficient-balance');
    return { ok: true };
  }
  if (event.type === 'dex.witness_attest') {
    const escrowId = event.payload.escrowId ?? event.payload.subjectEventId;
    const escrow = dexState(appliedEvents).escrows.get(escrowId);
    if (!escrow) return fail('escrow-not-found');
    if (!verifiedIdentities(appliedEvents).includes(event.author)) return fail('witness-not-verified');
    if (event.author === escrow.buyer || event.author === escrow.seller) return fail('witness-is-party');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_release' || event.type === 'dex.escrow_refund') {
    const escrow = dexState(appliedEvents).escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    if (escrow.status !== 'open') return fail('escrow-already-settled');
    if (escrow.buyer !== event.payload.buyer) return fail('escrow-buyer-mismatch');
    if (event.payload.amount !== escrow.amount) return fail('escrow-amount-mismatch');
    if (event.type === 'dex.escrow_release') {
      const threshold = escrow.witnessThreshold ?? 0;
      if (escrow.seller !== event.payload.seller) return fail('escrow-seller-mismatch');
      if (threshold > 0 && witnessCount(appliedEvents, event.payload.escrowId) < threshold) return fail('witness-threshold-not-met');
    }
    if (event.type === 'dex.escrow_refund') {
      const timedOut = Number.isFinite(escrow.timeoutAt) && escrow.timeoutAt <= Date.now();
      const cancels = cancelAuthors(appliedEvents, event.payload.escrowId);
      const mutual = cancels.has(escrow.buyer) && cancels.has(escrow.seller);
      if (!timedOut && !mutual && !event.payload.buyer) return fail('refund-requires-timeout-or-mutual-cancel');
    }
    return { ok: true };
  }
  if (event.type === 'dex.escrow_cancel') {
    const escrow = dexState(appliedEvents).escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    if (![escrow.buyer, escrow.seller].includes(event.author)) return fail('cancel-author-not-party');
    return { ok: true };
  }
  return fail('dex-type-not-allowed');
}

function validateChatEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  const ids = verifiedIdentities(appliedEvents);
  if (event.type === 'chat.room_create') {
    if (typeof event.payload.roomId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,48}$/i.test(event.payload.roomId)) return fail('invalid-room-id');
    if (chatState(appliedEvents).rooms.has(event.payload.roomId)) return fail('room-already-exists');
    return { ok: true };
  }
  if (event.type === 'chat.room_join') {
    if (!chatState(appliedEvents).rooms.has(event.payload.roomId)) return fail('room-not-found');
    return { ok: true };
  }
  if (event.type === 'chat.message_create' || event.type === 'chat.message_send') {
    if (!chatState(appliedEvents).rooms.has(event.payload.roomId)) return fail('room-not-found');
    if (typeof event.payload.text !== 'string' || !event.payload.text.trim()) return fail('chat-message-required');
    return { ok: true };
  }
  if (event.type === 'chat.room_credit_issue' || event.type === 'chat.room_credit_transfer') {
    if (!ids.includes(event.author) && !event.payload.betaDev) return fail('room-credit-author-not-verified');
    if (!positive(event.payload.amount)) return fail('invalid-room-credit-amount');
    return { ok: true };
  }
  return fail('chat-type-not-allowed');
}

function positive(value: any) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function round(value: number) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function hex(value: any) {
  return typeof value === 'string' && /^[0-9a-f]+$/i.test(value);
}

function verifiedIdentities(events: AquaEvent[]) {
  return identityState(events).verified;
}

function optedInIdentities(events: AquaEvent[]) {
  const opted = new Set<string>();
  for (const event of events) {
    if (event.type === 'governance.committee_opt_in') opted.add(event.author);
    if (event.type === 'governance.committee_opt_out') opted.delete(event.author);
  }
  return [...opted];
}

function deterministicCommitteeBeta(roundId: string, priorEventHash: string, eligibleUserIds: string[], count: number) {
  const seed = `${roundId}|${priorEventHash}|${[...eligibleUserIds].sort().join('|')}`;
  return [...eligibleUserIds]
    .sort((a, b) => simpleHash(`${seed}|${a}`).localeCompare(simpleHash(`${seed}|${b}`)))
    .slice(0, count);
}

function simpleHash(value: string) {
  let out = 2166136261;
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return String(out >>> 0).padStart(10, '0');
}

function witnessCount(events: AquaEvent[], escrowId: string) {
  return new Set(events.filter((event) => event.type === 'dex.witness_attest' && (event.payload.escrowId ?? event.payload.subjectEventId) === escrowId).map((event) => event.author)).size;
}

function cancelAuthors(events: AquaEvent[], escrowId: string) {
  return new Set(events.filter((event) => event.type === 'dex.escrow_cancel' && event.payload.escrowId === escrowId).map((event) => event.author));
}

function fail(reason: string): ModuleValidationResult {
  return { ok: false, reason };
}
