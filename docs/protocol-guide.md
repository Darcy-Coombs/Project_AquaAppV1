# Plain English Protocol Guide

This guide explains Project Aqua without assuming protocol or blockchain knowledge.

## What Aqua Is

Project Aqua is a way for people and software agents to share a ledger without a central owner.

An Aqua node is just a local program that:

1. Creates signed events.
2. Stores events on disk.
3. Checks events from other nodes.
4. Shares events with peers.
5. Rebuilds balances, votes, proposals, quotes, and identity state from the event log.

There is no single master server. There is no chain that everyone must obey. There are compatible event logs that can sync, fork, merge, and be replayed.

## The Base Protocol

The base protocol is deliberately small.

It defines:

- how an event is shaped
- how an event is signed
- how an event ID is calculated
- how events reference parents
- how a node stores and validates events
- how nodes exchange events
- how a bundle is imported or exported

The base protocol does not know the full meaning of money, identity, voting, DEX trades, or chat. Those are modules.

This keeps the protocol forkable. A community can keep the base memory layer and swap modules in or out.

## The Event Log

Every action becomes an event.

An event says:

- who authored it
- what module it belongs to
- what type of action it is
- when it was created
- what earlier events it points to
- what payload it carries
- what signature proves the author created it

The event log is append-only in spirit. Module state is rebuilt by reading events from the beginning.

For example:

```text
identity.claim
identity.pohw_attest
money.issue_aqua
money.transfer
governance.proposal_create
governance.vote_cast
dex.quote_create
```

## Why Event-Derived State Matters

A node should not trust a stored balance as truth.

Instead, it should ask:

```text
Given this event log, what is the balance?
Given this event log, what is the vote tally?
Given this event log, what is the PoHW status?
```

That means another node can receive the same events and rebuild the same answer.

It also means mistakes can be inspected. The history is replayable.

## The DAG

Events may reference zero, one, or two parents.

This creates a small directed acyclic graph, or DAG. In plain language: events can point backward to earlier events.

Parent links help nodes understand rough causality:

- this event follows that event
- this vote belongs after that proposal
- this attestation relates to that identity

This prototype stores parent references but keeps conflict resolution mostly inside modules.

## Validation

Base validation checks:

- event protocol is supported
- event ID matches the canonical event body
- event signature matches the author public key
- event has no more than two parents

If the signature is invalid, the event is rejected.

If the module is unknown, the event can still be stored, but it is not applied by the local node unless that module is enabled.

## Conflicts

Aqua does not pretend conflict cannot happen.

Conflicting events can exist in the DAG. Modules decide how to mark events stale, unresolved, overridden, or superseded.

Examples:

- a money transfer may be rejected by module rules if the sender lacks balance
- a later direct vote overrides a proxy vote for that proposal
- a proxy revoke cancels a previous proxy
- a quote cancel makes a quote inactive

The base protocol stores memory. Modules interpret memory.

## Identity

An Aqua identity is a public key plus events around that key.

The prototype supports:

- persistent key generation
- `identity.claim`
- `identity.pohw_attest`
- key rotation stubs
- recovery stubs

Proof of Human Work is deliberately a placeholder for now. It stores a public status, not private personal data.

PoHW statuses:

```text
unverified
locally_verified
vouched
challenged
archived
```

One verified identity equals one civic account.

## Money

The money module defines:

- Earth: fixed reserve created at genesis
- Aqua: spendable currency
- Fire: 4 percent transfer tax
- Sump: pool fed by Fire for future UBI after the Earth runway

Default test values:

```text
earthTotal = 300_000_000_000_000
weeklyAquaPerVerifiedHuman = 480
fireTaxRate = 0.04
```

Example transfer:

```text
Alice sends 100 Aqua to Bob.
Alice loses 100.
Bob receives 96.
Fire/Sump receives 4.
```

Balances are derived from events.

## Governance

The governance module implements:

- one verified human = one vote
- proposal creation
- direct voting
- proxy delegation
- proxy revocation
- direct votes override proxies
- deterministic random committee selection
- fork-friendly protocol upgrade proposals

A protocol upgrade proposal does not force old nodes to update. Nodes can keep running the old protocol or choose a fork.

## DEX

The DEX module is fracture-tolerant and local-first.

It supports:

- signed expiring quotes
- client-side order books from gossiped quotes
- escrow events
- witness attestations
- voucher pools
- voucher mint/burn/redeem events

Quotes are signed speech. They are not binding until escrow opens.

Voucher pools lock Aqua and mint local room credits 1:1.

## Gossip

Nodes sync over WebSocket.

The flow is:

1. Node A connects to Node B.
2. They exchange known event IDs.
3. Each node asks for missing events.
4. Received events are validated.
5. Valid new events are stored.
6. Valid new events are rebroadcast.

Nodes can also export and import JSON bundles.

## What This Prototype Is Not

This is not:

- a production currency
- a final constitution
- a biometric identity system
- a centralized exchange
- a blockchain framework
- an EVM app
- a hosted SaaS

It is a working protocol seed that can be extended by communities, apps, and agents.

## Design Principle

Keep the shared base simple.

Let modules evolve.

Let people fork.

Let agents read the rules.

Keep the center weak and the edges capable.
