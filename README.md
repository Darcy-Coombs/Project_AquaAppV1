# Project Aqua v0.1

Project Aqua is a local-first protocol seed for shared civic memory.

It is not a blockchain, not an EVM app, and not a central server. It is a small TypeScript reference implementation for a peer-to-peer ledger made of signed events. Nodes store events locally, sync with peers, and rebuild module state from the event log.

The app is only one interface. The protocol is the thing.

## Start Here

Read these in order if you are new:

1. [Plain English Protocol Guide](docs/protocol-guide.md)
2. [Event Format](docs/event-format.md)
3. [Module Rules](docs/modules.md)
4. [Runbook](docs/runbook.md)
5. [Node API](docs/node-api.md)
6. [Build Apps and Agents](docs/build-apps-and-agents.md)
7. [Glossary](docs/protocol-glossary.md)

## Core Idea

Aqua nodes share memory by exchanging signed events.

Every action is an event:

- creating an identity
- attesting Proof of Human Work status
- issuing Aqua
- sending Aqua
- creating a proposal
- voting
- setting a proxy
- creating a DEX quote
- opening escrow
- importing or exporting event bundles

The base protocol only defines shared memory and communication:

- deterministic canonical JSON
- signed events
- event IDs
- event DAG
- validation
- gossip sync
- local storage
- bundle import/export
- visible protocol and module versions

Everything else is a module:

- identity
- money
- governance
- DEX
- chat bridge

Modules are optional. Forks are allowed. Upgrades are not forced.

## Repository Map

```text
packages/
  protocol/      Base event, crypto, canonical JSON, DAG, validation
  identity/      Identity claims, PoHW status, recovery stubs
  money/         Earth, Aqua, Fire, Sump, balances
  governance/    Proposals, votes, proxies, committees, tallies
  dex/           Quotes, escrow, voucher pools, witnesses
  gossip/        WebSocket sync and bundles
  node/          Reference local node and HTTP API
  web/           Simple browser interface
  tests/         Protocol and module tests
```

## Requirements

- Node.js 24 or newer
- No database server
- No blockchain node
- No app-store dependency

This prototype uses file-backed storage for the node and browser storage for the UI.

## Commands

On Windows PowerShell, use `npm.cmd` if script execution blocks `npm`.

```bash
npm install
npm run build
npm run test
npm run dev:node -- --port 7001
npm run dev:node -- --port 7002 --peer ws://localhost:7001
npm run dev:web
```

The node stores data in `.aqua-node-<port>/` by default. Use `--data <path>` to choose another folder.

## Try the Reference UI

Start a node:

```bash
npm run dev:node -- --port 7001
```

Start the browser UI:

```bash
npm run dev:web
```

Open:

```text
http://localhost:5173
```

The UI defaults to `http://localhost:7001`. You can change the node URL in the top-right field.

## Acceptance Flow

Run two nodes:

```bash
npm run dev:node -- --port 7001
npm run dev:node -- --port 7002 --peer ws://localhost:7001
```

Then:

1. Create an identity on node 1.
2. Create an identity on node 2.
3. Mark both `locally_verified`.
4. Issue weekly Aqua.
5. Send `100` Aqua from node 1 identity to node 2 identity.
6. Node 2 receives `96` Aqua.
7. `4` Aqua goes to Fire/Sump.
8. Create a proposal.
9. Vote from both identities.
10. See the tally update.
11. Export a bundle from one node.
12. Import it into a fresh node.
13. Balances and votes rebuild from events.

## What To Share

To let other people use or inspect the protocol, share the repo with:

```text
package.json
package-lock.json
README.md
docs/
scripts/
packages/protocol/
packages/identity/
packages/money/
packages/governance/
packages/dex/
packages/gossip/
packages/node/
packages/tests/
packages/web/
```

Do not share local runtime state:

```text
.aqua-node-*/
node_modules/
*.log
*.err.log
```

Those are ignored by `.gitignore`.

## Prototype Status

This is v0.1. It is a protocol seed, not production infrastructure.

Implemented:

- Ed25519 event signatures using Node crypto
- deterministic canonical JSON
- event DAG storage
- duplicate-event ignore
- invalid-signature rejection
- unknown-module storage without application
- event-derived balances and tallies
- WebSocket gossip between local nodes
- bundle import/export
- simple browser UI

Still stubbed or intentionally simple:

- Proof of Human Work is status-only
- key recovery is only event-shaped
- DEX witnesses are attestations, not real-world enforcement
- voucher pools are local prototype credits
- no spam control, fee market, or Sybil-resistant committee hardening
- no encrypted private messaging yet
- no formal protocol registry

## Philosophy

Aqua is meant to be a field of tents, not a castle and moat.

The center should stay weak. The edges should stay capable. Communities, apps, agents, and nodes should be able to read the protocol, run it, fork it, and join compatible peers without needing permission from a company or platform.
