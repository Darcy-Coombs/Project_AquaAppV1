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
  if (event.type === 'identity.claim' && typeof event.payload.name !== 'string') return fail('identity-name-required');
  if (event.type === 'identity.pohw_attest') {
    if (typeof event.payload.subject !== 'string') return fail('pohw-subject-required');
    if (!['unverified', 'locally_verified', 'vouched', 'challenged', 'archived'].includes(event.payload.status)) return fail('invalid-pohw-status');
  }
  return { ok: true };
}

function validateMoneyEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  if (event.type === 'money.issue_aqua') {
    if (!positive(event.payload.amount)) return fail('invalid-issue-amount');
    if (!identityState(appliedEvents).verified.includes(event.payload.to)) return fail('issue-recipient-not-verified');
  }
  if (event.type === 'money.transfer') {
    if (event.payload.from && event.payload.from !== event.author) return fail('transfer-from-author-mismatch');
    if (!positive(event.payload.amount)) return fail('invalid-transfer-amount');
    if (typeof event.payload.to !== 'string' || !event.payload.to) return fail('transfer-recipient-required');
    if (!canSpend(appliedEvents, event.author, event.payload.amount)) return fail('insufficient-balance');
  }
  return { ok: true };
}

function validateGovernanceEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  const ids = identityState(appliedEvents).verified;
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
  }
  if (event.type === 'dex.escrow_open') {
    if (event.payload.buyer !== event.author) return fail('escrow-buyer-author-mismatch');
    if (!positive(event.payload.amount)) return fail('invalid-escrow-amount');
    if (event.payload.quoteId && !activeQuotes(appliedEvents).some((quote) => quote.id === event.payload.quoteId)) return fail('quote-not-active');
    if (!canSpend(appliedEvents, event.author, event.payload.amount)) return fail('insufficient-balance');
  }
  if (event.type === 'dex.escrow_release' || event.type === 'dex.escrow_refund') {
    const escrow = dexState(appliedEvents).escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    if (escrow.status !== 'open') return fail('escrow-already-settled');
    if (escrow.buyer !== event.payload.buyer) return fail('escrow-buyer-mismatch');
    if (event.payload.amount !== escrow.amount) return fail('escrow-amount-mismatch');
    if (event.type === 'dex.escrow_release') {
      if (escrow.seller !== event.payload.seller) return fail('escrow-seller-mismatch');
      if (event.author !== escrow.seller) return fail('escrow-release-author-not-seller');
    }
  }
  return { ok: true };
}

function validateChatEvent(event: AquaEvent, appliedEvents: AquaEvent[]): ModuleValidationResult {
  const ids = identityState(appliedEvents).verified;
  if (!ids.includes(event.author)) return fail('chat-author-not-verified');
  if (event.type === 'chat.room_create') {
    if (typeof event.payload.roomId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,48}$/i.test(event.payload.roomId)) return fail('invalid-room-id');
    if (chatState(appliedEvents).rooms.has(event.payload.roomId)) return fail('room-already-exists');
  }
  if (event.type === 'chat.message_create') {
    if (!chatState(appliedEvents).rooms.has(event.payload.roomId)) return fail('room-not-found');
    if (typeof event.payload.text !== 'string' || !event.payload.text.trim()) return fail('chat-message-required');
  }
  return { ok: true };
}

function positive(value: any) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function fail(reason: string): ModuleValidationResult {
  return { ok: false, reason };
}
