# Project Aqua 1.1.0-alpha.1

Download the Windows portable alpha from [GitHub Releases](https://github.com/Darcy-Coombs/Project_AquaAppV1/releases/tag/v1.1.0-alpha.1). Extract the ZIP, run `RUN_ALPHA.cmd`, and open `http://127.0.0.1:8787`. This is a single-authority testnet with 700 trillion Earth, 100,000 per-account Earth allowance, 480 weekly UBI and 4% Fire into Sump. See [setup, tested behaviour and limitations](docs/alpha-readiness.md).

## BranchID and the new interface

Home, Wallet, Community and Decisions now provide the primary navigation. Existing chat, ID Lab, sync, voucher pools and legacy test tools remain accessible through secondary navigation. All monetary values in this prototype are simulated.

On Windows, from `C:\Users\David\Documents\Poj_Aq_build_goalbuild`:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Choose **Explore demo** for the isolated BranchID experience. In Community, create the prefilled invitation as Maya, switch **Act as** to You, review and accept it. Use **Simulate offline** before acceptance to see pending/reconnect behaviour. In Decisions, propose growth, switch among three members and explicitly consent to public test votes, then advance the demo clock to close. Home allows a funded 480 Aqua simulated claim. Exit/reset/refresh discards the demo without touching your existing wallet, keys or transport.

Real identities remain key-only or admission-pending: the existing gossip relay does not provide secure admission finality or secret ballots. No production membership, governance or payment entitlement is activated. Public ancestry reveals relationships and does not prove globally unique humanity. See [BranchID design, architecture, limitations and migration](docs/branchid-design.md).

Use More & settings → identity/settings → **Encrypted key backup & restore** before changing devices. Existing databases and keys are not migrated or overwritten; pending BranchID requests use an additive, versioned namespace. Private-key recovery is unavailable without your encrypted backup and passphrase.

Validation: `npm.cmd test`, `npm.cmd run build`, and, with the app running, `npx.cmd playwright test tests/e2e/branchid.spec.ts --project chromium --workers 1`. Responsive screenshots are written to `output/playwright/branchid`. Run `npm.cmd run fieldkit:build` to refresh the direct-open HTML distributions.

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

Double-click `RUN_PROJECT_AQUA.cmd` on Windows for the easiest local launch. Double-click `PHONE_TEST_AQUA.cmd` to expose the app and relay on your LAN for phone sync testing. From GitHub, use the `gh-pages` fieldkit build, the direct-open root `index.html`, or open the repo in Codespaces; `.devcontainer/devcontainer.json` installs dependencies, starts the stack, and forwards the web app. Manual run: `npm run dev`, then open `http://127.0.0.1:5173`. The node relay runs at `http://127.0.0.1:8787`. See `RUN.md` for the quick run card.

## Phone Fieldkit

The source-code `packages/web/index.html` is a Vite entry file and will not run by itself from a phone download. For a phone, use the published GitHub Pages fieldkit, the direct-open root `index.html`, the generated `fieldkit/index.html`, or the LAN URL printed by `PHONE_TEST_AQUA.cmd`. For live sync/gossip tests, the phone and computer should be on the same Wi-Fi, then set Settings -> Relay node URL to the printed `http://<computer-lan-ip>:8787` node URL.

Run `npm.cmd run fieldkit:build` to regenerate the direct-open fieldkit after web changes.
