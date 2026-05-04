# Build Apps and Agents

This guide explains how another app, script, or AI agent can use Project Aqua.

## The Rule

Do not hide protocol logic inside UI code.

Apps and agents should treat the node as a signed-event engine:

1. Read events.
2. Create valid events.
3. Submit events.
4. Rebuild state from events.
5. Sync with peers or bundles.

## Option 1: Use The Node API

The easiest path is to run a local node and call HTTP endpoints.

Example:

```text
POST /identity/create
POST /money/transfer
GET /events
GET /balance/:pubkey
GET /bundle/export
```

Use this when:

- building a web app
- building a mobile wrapper
- scripting local tests
- giving an AI agent an easy tool surface

## Option 2: Import Protocol Modules

Another TypeScript app can import the protocol package files directly.

Example:

```ts
import { createEvent, verifyEvent } from './packages/protocol/event.ts';
import { generateIdentityKeypair } from './packages/protocol/crypto.ts';

const keypair = generateIdentityKeypair();

const event = createEvent({
  module: 'system',
  type: 'system.note',
  keypair,
  payload: {
    text: 'hello Aqua'
  }
});

console.log(verifyEvent(event));
```

Use this when:

- building another node
- building test tooling
- writing new modules
- implementing the protocol in another runtime

## Option 3: Implement Aqua In Another Language

To make another implementation compatible, reproduce these rules:

1. Sort JSON object keys recursively.
2. Exclude `id` and `signature` before hashing/signing.
3. Hash the canonical event body with SHA-256.
4. Sign the same canonical body with Ed25519.
5. Validate event ID and signature before storage.
6. Store unknown-module events without applying them.
7. Ignore duplicate event IDs.
8. Rebuild module state from valid events.

The key documents are:

- [Event Format](event-format.md)
- [Module Rules](modules.md)
- [Node API](node-api.md)

## Adding A New Module

A module should have:

- a clear module name
- event type names
- payload schemas
- reducer functions that derive state from events
- tests
- version string

Example module name:

```text
chat
```

Example event types:

```text
chat.message_create
chat.room_join
chat.bridge_import
```

Keep the base protocol unchanged unless the shared memory format itself must change.

## Agent Guidelines

An Aqua-aware agent should:

- read the docs before acting
- inspect the event log before creating new events
- use the node's local identity only with permission
- explain which module event it is creating
- prefer bundle export/import for portable memory
- never treat stored balances as truth without replaying events
- treat protocol upgrades as fork choices, not forced migrations

## Compatibility Checklist

A compatible node should:

- accept `aqua.base.v0.1`
- verify Ed25519 signatures
- calculate event IDs deterministically
- store valid unknown-module events
- ignore duplicates
- expose or support event export
- rebuild balances and tallies from events
- preserve module version visibility

## What Not To Depend On

Do not depend on:

- the browser UI
- a particular central server
- a specific app store
- hidden database state
- event order alone when parent references matter
- private personal data on the ledger

The durable thing is the signed event log.
