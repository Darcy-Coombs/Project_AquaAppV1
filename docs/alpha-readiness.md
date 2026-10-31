# Project Aqua 1.1.0-alpha.1

This release is a single-authority **alpha testnet**. Accounts and funds are for testing. Public alpha ballots are signed and visible. It is not a production payment network, proof of unique humanity, private ballot system or distributed consensus system.

## Run the Windows download

Extract the entire Windows x64 ZIP to a writable folder, then double-click `RUN_ALPHA.cmd`. Open `http://127.0.0.1:8787`. Node 24 is included; no npm installation is needed. Keep the server window open. The local ledger persists in `data/alpha-v2.sqlite`; preserve this folder across restarts. Do not run two servers against the same file.

Choose **Create alpha test account**, then **Claim funded alpha UBI**. Use separate browser profiles for separate accounts. Register the receiving account first, copy its account ID, and send from **Wallet**. Confirmed balances come from the selected authority. All participants in a test must use the same authority. Separate installations create separate test ledgers.

In **Decisions**, explicitly consent to public test votes, create a proposal and vote from eligible accounts. Eligibility is snapshotted when a proposal opens. Each eligible account gets one ballot. Later accounts cannot join that ballot. These decisions do not grant production entitlements or approve BranchID growth.

The standalone demo HTML opens without a server and includes an isolated BranchID demonstration. It does not create a shared payment network. Source builds require Node 24: `npm ci`, `npm run build`, then set `AQUA_ALPHA_TESTNET=1`, `AQUA_WEB_DIST` to the absolute `packages/web/dist` folder, and run `node packages/node/dist/server.js`. For same-origin hosting build with `VITE_AQUA_NODE_URL=same-origin`.

## Confirmed monetary policy

- Earth reserve: **700,000,000,000,000 Aqua**, exactly seven billion allowances of 100,000.
- Lifetime Earth allowance per account: **100,000 Aqua**.
- Weekly UBI: **480 Aqua**, subject to available funding.
- Fire: **4%** of a transfer goes to Sump; the recipient receives the remainder. Fire rounds down to the smallest unit, 0.01 Aqua.
- After an account's Earth allowance is exhausted, available Sump pays UBI. Partial funding is recorded and can be topped up in the same period. No overdraft or additional issuance covers shortfalls.

Amounts use bigint minor units. Earth + circulating Aqua + locked pool reserves + Sump must remain equal to the genesis reserve. The reserve is accounting capacity, not evidence of seven-billion-user throughput. A 100,000 allowance covers 208 full weekly payments plus 160 Aqua. Funding 480 Aqua from a 4% tax requires 12,000 Aqua of taxable transfers per recipient per week before rounding; this is not a sustainability guarantee.

Policy `aqua-alpha-economy-v2-700t-100k-480-4pct` uses a fresh database. Existing populated, unversioned ledgers retain the legacy 300-trillion accounting basis and reject new writes. Do not rename an old database as the new one or edit its policy metadata. Keep old exports for inspection; there is no automatic monetary migration.

## Validation and limits

Automated coverage includes 128 identities, 384 claims, 2,048 transfers, shuffled replay, global reserve depletion, the lifetime allowance boundary, Sump shortfalls/top-ups, rounding, signer impersonation, pool ownership, duplicate and concurrent spends, duplicate claims, HTTP/bundle/WebSocket validation and durable restart recovery. Voting tests cover snapshots, forged ballots, duplicate ballots and closing time. Separate browser profiles exercise registration, UBI, confirmed payments and voting.

Self-verification is deliberately enabled for alpha tests and does not prevent one person creating multiple accounts. Browser signing keys are local; export an encrypted key backup before clearing browser data. A server operator controls availability and ordering. Requests can be rejected if another event wins the ordering race; refresh and retry a rejected action. A timed-out signed request stays pending until its exact ID is confirmed or rejected. This release has no independent security audit, large-scale load certification, production identity authority, private voting, or decentralised finality. Use on a trusted local test machine; external hosting requires further deployment/security work.
