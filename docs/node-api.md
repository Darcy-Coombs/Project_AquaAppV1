# Node API

The reference node exposes a small HTTP API.

Default URL:

```text
http://localhost:7001
```

All `POST` bodies are JSON.

## Identity

### Create Identity

```http
POST /identity/create
```

Body:

```json
{
  "name": "local-human",
  "pohwStatus": "locally_verified"
}
```

Creates:

- `identity.claim`
- `identity.pohw_attest`

### Get Local Identity

```http
GET /identity
```

Returns the node's public key, PoHW status, and verified flag.

## Events

### Submit Event

```http
POST /event
```

Body:

```json
{
  "id": "...",
  "protocol": "aqua.base.v0.1",
  "module": "money",
  "moduleVersion": "v0.1",
  "type": "money.transfer",
  "createdAt": 1234567890,
  "author": "...",
  "parents": [],
  "payload": {},
  "signature": "..."
}
```

Invalid signatures are rejected.

### List Events

```http
GET /events
```

### Get Event

```http
GET /events/:id
```

## Money

### Get Balance

```http
GET /balance/:pubkey
```

Returns:

```json
{
  "pubkey": "...",
  "aqua": 480,
  "locked": 0,
  "firePaid": 0,
  "sump": 0,
  "earthReserve": 300000000000000
}
```

### Issue Weekly Aqua

```http
POST /money/issue-weekly
```

Body:

```json
{
  "pubkey": "optional-specific-recipient"
}
```

If `pubkey` is omitted, the node issues weekly Aqua to all verified identities it knows.

### Transfer Aqua

```http
POST /money/transfer
```

Body:

```json
{
  "to": "receiver-public-key",
  "amount": 100
}
```

The API creates a `money.transfer` event from the node's local identity.

## Governance

### Create Proposal

```http
POST /governance/proposal
```

Body:

```json
{
  "title": "Open the commons",
  "body": "Proposal text",
  "choices": ["yes", "no"]
}
```

### Vote

```http
POST /governance/vote
```

Body:

```json
{
  "proposalId": "event-id",
  "choice": "yes"
}
```

### Set Proxy

```http
POST /governance/proxy
```

Body:

```json
{
  "proxy": "proxy-public-key"
}
```

### Revoke Proxy

```http
POST /governance/proxy
```

Body:

```json
{
  "revoke": true
}
```

### View Tally

```http
GET /governance/tally/:proposalId
```

### Publish Outcome

```http
POST /governance/outcome
```

Body:

```json
{
  "proposalId": "event-id",
  "note": "Published from replayed state"
}
```

## DEX

### Create Quote

```http
POST /dex/quote
```

Body:

```json
{
  "side": "sell",
  "base": "AQUA",
  "quote": "LOCAL",
  "amount": 10,
  "price": 1,
  "expiresAt": 1777363000000
}
```

### Escrow

```http
POST /dex/escrow
```

Open escrow:

```json
{
  "seller": "seller-public-key",
  "amount": 10,
  "quoteId": "optional-quote-id"
}
```

Release escrow:

```json
{
  "action": "release",
  "escrowId": "escrow-event-id",
  "buyer": "buyer-public-key",
  "seller": "seller-public-key",
  "amount": 10
}
```

Refund escrow:

```json
{
  "action": "refund",
  "escrowId": "escrow-event-id",
  "buyer": "buyer-public-key",
  "amount": 10
}
```

### DEX State

```http
GET /dex
```

Returns active quotes, escrows, voucher pools, and witness attestations.

### Witness Attestation

```http
POST /dex/witness
```

Body:

```json
{
  "subjectEventId": "quote-or-escrow-event-id",
  "statement": "off-chain condition observed"
}
```

## Chat

### Chat State

```http
GET /chat
```

Returns chat rooms and messages.

### Create Chat Room

```http
POST /chat/room
```

Body:

```json
{
  "roomId": "chaos-harbour",
  "name": "Chaos Harbour",
  "topic": "Local coordination"
}
```

### Send Chat Message

```http
POST /chat/message
```

Body:

```json
{
  "roomId": "chaos-harbour",
  "text": "Message text"
}
```

## Peers

### List Peers

```http
GET /peers
```

### Connect Peer

```http
POST /peers/connect
```

Body:

```json
{
  "url": "ws://localhost:7002"
}
```

## Bundles

### Export Bundle

```http
GET /bundle/export
```

Returns:

```json
{
  "protocol": "aqua.base.v0.1",
  "exportedAt": 1777363000000,
  "events": []
}
```

### Import Bundle

```http
POST /bundle/import
```

Body:

```json
{
  "protocol": "aqua.base.v0.1",
  "exportedAt": 1777363000000,
  "events": []
}
```

## Whole Node State

```http
GET /state
```

Useful for simple UIs and debugging.
