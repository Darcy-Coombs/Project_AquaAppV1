# Module Rules

Modules interpret valid events.

The base protocol stores signed memory. Modules decide what memory means.

## Identity Module

Path:

```text
packages/identity/
```

Purpose:

- create a local keypair
- create identity claim events
- record public PoHW status
- provide key rotation and recovery event stubs

Events:

```text
identity.claim
identity.pohw_attest
identity.key_rotate
identity.recovery_stub
identity.recovery_nominate
identity.recovery_accept
```

PoHW statuses:

```text
unverified
locally_verified
vouched
challenged
archived
```

Rules:

- no biometric data
- no private personal data on ledger
- one verified identity equals one civic account
- `locally_verified` and `vouched` count as verified in this prototype

## Money Module

Path:

```text
packages/money/
```

Purpose:

- model Earth, Aqua, Fire, and Sump
- derive balances from events
- keep accounting simple and auditable

Default config:

```text
earthTotal = 300_000_000_000_000
weeklyAquaPerVerifiedHuman = 480
fireTaxRate = 0.04
```

Events:

```text
money.genesis
money.issue_aqua
money.transfer
money.fire_collect
money.sump_topup
money.stale
```

Implemented event effects:

`money.genesis`

Sets the Earth reserve.

`money.issue_aqua`

Adds Aqua to a verified human.

`money.transfer`

Deducts full amount from sender, gives net amount to receiver, and sends Fire to Sump.

Example:

```text
send 100 Aqua
sender loses 100
receiver receives 96
Sump receives 4
```

`money.stale`

Marks a money event stale by event ID.

Rules:

- balances are derived from events, not stored as truth
- insufficient spend attempts are rejected by the node API before creating a transfer
- Fire currently feeds Sump directly inside transfer derivation

## Governance Module

Path:

```text
packages/governance/
```

Purpose:

- let verified humans create proposals and vote
- support proxy voting
- select deterministic committees
- propose fork-friendly protocol upgrades

Events:

```text
governance.proposal_create
governance.vote_cast
governance.proxy_set
governance.proxy_revoke
governance.committee_select
governance.protocol_upgrade_propose
governance.protocol_upgrade_accept
governance.outcome_publish
```

Rules:

- one verified human = one vote
- a user can vote directly or delegate by proxy
- a direct vote overrides proxy for that proposal
- proxy can be changed or revoked at any time
- committee selection is deterministic from recent event hashes
- protocol upgrade proposals do not force old nodes to update
- published outcomes are events derived from replayed tally state

Tally behavior:

1. Count direct votes from verified identities.
2. If a verified identity has no direct vote, check their current proxy.
3. If the proxy voted directly on that proposal, count the proxy's choice for the delegator.
4. Revoked proxies do not count.

## DEX Module

Path:

```text
packages/dex/
```

Purpose:

- provide a simple fracture-tolerant exchange model
- avoid central custody
- allow local voucher pools and witness attestations

Events:

```text
dex.quote_create
dex.quote_cancel
dex.escrow_open
dex.escrow_release
dex.escrow_refund
dex.witness_attest
dex.voucher_pool_create
dex.voucher_mint
dex.voucher_burn
dex.voucher_redeem
```

Rules:

- quotes are signed speech
- quotes expire
- quotes are not binding until escrow opens
- escrow locks Aqua
- escrow release transfers locked Aqua to seller
- escrow refund returns locked Aqua to buyer
- witnesses are bonded identities in event form
- witness attestation is a stub for off-chain trades
- voucher pools lock Aqua and mint local room credits 1:1
- multiple pools can exist
- no central exchange
- no custody by a central server

## Gossip Module

Path:

```text
packages/gossip/
```

Purpose:

- let local nodes sync event logs
- support import/export bundles

Messages:

```text
hello
get
events
```

Flow:

1. Peers exchange known event IDs with `hello`.
2. A node requests missing IDs with `get`.
3. A node sends requested events with `events`.
4. Received events are validated.
5. New valid events are stored and rebroadcast.

## Chat Module

Path:

```text
packages/chat/
```

Purpose:

- create local-first Chaos Chat rooms
- store signed room messages as replayable events
- keep chat as a module on top of the base protocol

Events:

```text
chat.room_create
chat.message_create
```

Rules:

- room creators and message authors must be verified identities
- room IDs are stable simple slugs
- messages must point to an existing room

Chaos Chat is intentionally small: it proves signed rooms and messages before adding richer moderation, encryption, or room sync policy.
