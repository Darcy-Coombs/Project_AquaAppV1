import { type AquaEvent } from '../protocol/event.ts';
import { identityState } from '../identity/identity.ts';

export function governanceState(events: AquaEvent[]) {
  const proposals = new Map<string, AquaEvent>();
  const votes = new Map<string, Map<string, AquaEvent>>();
  const proxies = new Map<string, string>();

  for (const event of events) {
    if (event.module !== 'governance') continue;
    if (event.type === 'governance.proposal_create' || event.type === 'governance.protocol_upgrade_propose') {
      proposals.set(event.id, event);
    }
    if (event.type === 'governance.vote_cast') {
      if (!votes.has(event.payload.proposalId)) votes.set(event.payload.proposalId, new Map());
      votes.get(event.payload.proposalId)!.set(event.author, event);
    }
    if (event.type === 'governance.proxy_set') proxies.set(event.author, event.payload.proxy);
    if (event.type === 'governance.proxy_revoke') proxies.delete(event.author);
  }

  return { proposals, votes, proxies };
}

export function tallyProposal(events: AquaEvent[], proposalId: string) {
  const ids = identityState(events).verified;
  const { votes, proxies } = governanceState(events);
  const directVotes = votes.get(proposalId) ?? new Map();
  const tally: Record<string, number> = {};
  const counted: Record<string, string> = {};

  for (const voter of ids) {
    const direct = directVotes.get(voter);
    if (direct) {
      tally[direct.payload.choice] = (tally[direct.payload.choice] ?? 0) + 1;
      counted[voter] = `direct:${direct.payload.choice}`;
      continue;
    }

    const proxy = proxies.get(voter);
    const proxyVote = proxy ? directVotes.get(proxy) : undefined;
    if (proxyVote) {
      tally[proxyVote.payload.choice] = (tally[proxyVote.payload.choice] ?? 0) + 1;
      counted[voter] = `proxy:${proxy}:${proxyVote.payload.choice}`;
    }
  }

  return { proposalId, tally, counted, verifiedHumans: ids.length };
}
