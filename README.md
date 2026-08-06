# Project Aqua Web App v1.0

Browser-first, local-first TypeScript implementation of the Aqua civic-economic protocol. The protocol package is UI-independent and drives identity, UBI, Fire/Sump accounting, Chaos Chat, governance, voucher pools, bundles, and deterministic replay.

## Modules

- `packages/protocol`: signed canonical events, DAG replay, identity, money, chat, governance, DEX, bundle validation.
- `packages/shared`: constants, config, production BETAoverride guard, amount helpers.
- `packages/node`: local Node relay using HTTP, WebSocket gossip, and Node's built-in SQLite.
- `packages/web`: Vite React installable web app with IndexedDB persistence and offline queue.
- `tests`: Vitest unit/integration coverage and Playwright E2E smoke flow.

## Commands

PowerShell may block `npm.ps1`; use `npm.cmd` on this machine when needed.

```bash
npm install
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run dev
npm run build
npm run lint
npm run typecheck
```

## Limitations

This v1 intentionally excludes NAMIA, full Equitism, real fiat ramps, KYC, banking, production biometrics, regulated exchange, and production global consensus. PoHW-lite is a local proof hash. Email verification uses a dev relay inbox. `node:sqlite` is currently experimental in Node 24.

## Usable App

Double-click `RUN_PROJECT_AQUA.cmd` on Windows for the easiest local launch. Double-click `PHONE_TEST_AQUA.cmd` to expose the app and relay on your LAN for phone sync testing. From GitHub, open the repo in Codespaces; `.devcontainer/devcontainer.json` installs dependencies, starts the stack, and forwards the web app. Manual run: `npm run dev`, then open `http://127.0.0.1:5173`. The node relay runs at `http://127.0.0.1:8787`. See `RUN.md` for the quick run card.
