# Runbook

This page explains how to run Project Aqua locally.

## Install

```bash
npm install
```

On Windows PowerShell, use this if `npm` is blocked:

```bash
npm.cmd install
```

## Build

```bash
npm run build
```

PowerShell:

```bash
npm.cmd run build
```

The build command imports every TypeScript module to catch syntax and module loading problems.

## Test

```bash
npm run test
```

PowerShell:

```bash
npm.cmd test
```

The tests cover:

- keypair creation
- event signing and signature failure after tampering
- deterministic event IDs
- duplicate event handling
- unknown module storage without application
- Earth/Aqua/Fire/Sump accounting
- balance rebuild from event log
- governance votes and proxies
- deterministic committees
- DEX quotes, escrow, witnesses, and vouchers
- two-node gossip sync
- reload from node storage

## Run One Node

```bash
npm run dev:node -- --port 7001
```

Node URL:

```text
http://localhost:7001
```

WebSocket peer URL:

```text
ws://localhost:7001
```

Storage folder:

```text
.aqua-node-7001/
```

## Run Two Nodes

Terminal 1:

```bash
npm run dev:node -- --port 7001
```

Terminal 2:

```bash
npm run dev:node -- --port 7002 --peer ws://localhost:7001
```

Node 2 connects to node 1 and begins gossip sync.

## Run The Browser UI

```bash
npm run dev:web
```

Open:

```text
http://localhost:5173
```

The UI can point at either node:

```text
http://localhost:7001
http://localhost:7002
```

## Manual Acceptance Test

1. Start node 1 on port `7001`.
2. Start node 2 on port `7002` with peer `ws://localhost:7001`.
3. Open the UI.
4. Point the UI at node 1.
5. Create an identity with `locally_verified` PoHW status.
6. Point the UI at node 2.
7. Create an identity with `locally_verified` PoHW status.
8. Wait a moment for gossip.
9. Point the UI at node 1.
10. Issue weekly Aqua.
11. Send `100` Aqua from node 1 to node 2 public key.
12. Check node 2 balance.
13. Node 2 should receive `96` Aqua from the transfer.
14. Fire/Sump should increase by `4`.
15. Create a proposal.
16. Vote from both nodes.
17. View tally.
18. Export a bundle.
19. Import into a fresh node.
20. Confirm balances and votes rebuild.

## Reset Local State

Stop running nodes, then delete:

```text
.aqua-node-7001/
.aqua-node-7002/
```

These folders contain local keys and event logs.

Do not delete them if you want to keep those node identities.

## Share A Bundle

Export:

```text
GET /bundle/export
```

Import:

```text
POST /bundle/import
```

Bundles are plain JSON and contain signed events.

## Troubleshooting

If PowerShell blocks `npm`, use `npm.cmd`.

If a node says a port is already in use, choose another port:

```bash
npm run dev:node -- --port 7010
```

If a peer does not sync, check that you used a WebSocket URL:

```text
ws://localhost:7001
```

not:

```text
http://localhost:7001
```
