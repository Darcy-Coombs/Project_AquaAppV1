# Protocol Glossary

## Aqua

The spendable currency in the Project Aqua money module.

## Base Protocol

The shared event, validation, DAG, gossip, storage, and bundle layer.

## Bundle

A JSON export of signed events that can be imported by another node.

## Canonical JSON

A deterministic JSON representation. Aqua sorts object keys recursively so event hashes and signatures are stable.

## DAG

Directed acyclic graph. Aqua events can point backward to up to two parent events.

## Earth

The fixed reserve created at genesis.

## Event

A signed action. Every meaningful protocol action is represented as an event.

## Fire

The transfer tax. In the prototype, Aqua transfers apply a 4 percent Fire amount.

## Gossip

Peer-to-peer event sync over WebSocket.

## Module

A protocol extension that interprets events. Identity, money, governance, DEX, and chat are modules.

## Parent

An earlier event referenced by a newer event.

## PoHW

Proof of Human Work. In this prototype, it is a status-only identity attestation with no biometric or private personal data.

## Proxy

A governance delegation. A verified human can delegate voting power to another identity. A direct vote overrides proxy voting for that proposal.

## Sump

The pool fed by Fire. It is intended for later UBI after the Earth runway.

## Verified Human

An identity with PoHW status `locally_verified` or `vouched` in this prototype.

## Voucher Pool

A DEX module structure where Aqua is locked and local room credits are minted 1:1.
