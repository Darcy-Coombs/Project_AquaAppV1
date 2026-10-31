## Download and run

Download **Project-Aqua-1.1.0-alpha.1-win-x64.zip**, extract the entire folder, run **RUN_ALPHA.cmd**, then open **http://127.0.0.1:8787**. Node 24.14.0 is included. Use separate browser profiles to create multiple accounts against the same running authority. Keep the `data` folder to retain the ledger.

The HTML asset is an offline demo; shared accounts and payments require the running server. SHA256 checksums are supplied for both downloads.

## What this alpha adds

- Confirmed multi-account wallet, funded UBI, payment history and public test ballots.
- Exact **700 trillion Earth**, **100,000 Aqua lifetime Earth allowance**, **480 weekly UBI**, and **4% Fire into Sump**.
- Signer and payload ownership enforcement, duplicate/concurrent spend protection, consistent validation for HTTP/bundles/WebSocket, durable restart recovery, and pool deposit ownership.
- Snapshot voter eligibility, one ballot per account, explicit consent to public test voting and authority-enforced closing times.
- BranchID demonstration, Home/Wallet/Community/Decisions navigation, ID Lab and encrypted key backups.

## Validation

53 unit/integration tests passed, followed by an additional passing global-reserve-depletion test (54 total covered). The accounting scenario exercises 128 identities, 384 claims and 2,048 transfers, plus reordered replay. All 32 desktop/mobile browser tests passed. The extracted Windows package was additionally checked with separate browser accounts, payment acknowledgement loss/retry, voting and conserved global totals.

## Scope

**Alpha testnet only: test accounts and funds, one ordering authority, public signed ballots.** This does not establish seven-billion-user throughput, economic sustainability, private voting, unique-human identity or decentralised consensus. Sump pays only available funds; underfunded UBI remains unpaid. Existing legacy databases are not automatically migrated. Read `READ-ME-FIRST.md` in the ZIP or `docs/alpha-readiness.md` in the source before testing.
