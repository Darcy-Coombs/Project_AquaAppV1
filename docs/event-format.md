# Event Format

Every Aqua action is represented as a signed event.

## Shape

```json
{
  "id": "hash of canonical event body",
  "protocol": "aqua.base.v0.1",
  "module": "money",
  "moduleVersion": "v0.1",
  "type": "money.transfer",
  "createdAt": 1234567890,
  "author": "publicKey",
  "parents": ["eventId1", "eventId2"],
  "payload": {},
  "signature": "signature over canonical body excluding id and signature"
}
```

## Fields

`id`

The SHA-256 hash of the canonical event body. The body excludes `id` and `signature`.

`protocol`

The base protocol version. For this prototype:

```text
aqua.base.v0.1
```

`module`

The module that interprets the event.

Current modules:

```text
system
identity
money
governance
dex
chat
```

Unknown modules may be stored but are not applied by a node unless enabled.

`moduleVersion`

The module rule version. Current prototype modules use:

```text
v0.1
```

`type`

The event type. Event types are namespaced by module:

```text
identity.claim
money.transfer
governance.vote_cast
dex.quote_create
```

`createdAt`

Unix timestamp in milliseconds.

`author`

The author's public key. The public key is used to verify the signature.

`parents`

Zero, one, or two event IDs that this event references.

`payload`

Module-specific data.

`signature`

An Ed25519 signature over the canonical event body, excluding `id` and `signature`.

## Canonical JSON

Canonical JSON must be deterministic.

This prototype sorts object keys recursively before stringifying. Arrays keep their original order.

That means these two payloads produce the same canonical form:

```json
{ "b": 2, "a": 1 }
```

```json
{ "a": 1, "b": 2 }
```

The implementation lives in:

```text
packages/protocol/canonical-json.ts
```

## Event ID

The event ID is:

```text
sha256(canonicalJson(eventWithoutIdAndSignature))
```

The implementation lives in:

```text
packages/protocol/event.ts
```

## Signature

The signature signs the same canonical body used for the event ID.

The implementation uses Ed25519 from Node's built-in crypto module:

```text
packages/protocol/crypto.ts
```

If the body changes after signing, verification fails.

## Base Validation Rules

A node rejects an event if:

- the protocol version is unsupported
- the event has more than two parents
- the event ID does not match the canonical body
- the signature does not verify against the author public key

A node ignores duplicates.

A node may store unknown-module events without applying them.

## Example: Money Transfer

```json
{
  "id": "e3f...",
  "protocol": "aqua.base.v0.1",
  "module": "money",
  "moduleVersion": "v0.1",
  "type": "money.transfer",
  "createdAt": 1777363000000,
  "author": "MCowBQYDK2VwAyEA...",
  "parents": [],
  "payload": {
    "from": "MCowBQYDK2VwAyEA...",
    "to": "MCowBQYDK2VwAyEA...",
    "amount": 100,
    "netAmount": 96,
    "fireAmount": 4,
    "fireTaxRate": 0.04
  },
  "signature": "base64-signature"
}
```

## Important Rule

The base event layer does not decide whether a transfer, vote, quote, or identity is meaningful.

It only decides whether the event is well-formed and authentically signed.

Module reducers interpret valid events.
