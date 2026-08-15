# Easy Start

For the shortest run card, see `RUN.md`.

Fastest local path: double-click `RUN_PROJECT_AQUA.cmd`.

Phone test path: double-click `PHONE_TEST_AQUA.cmd`, open the printed phone URL, then save the printed relay URL in Settings.

1. Install dependencies:

```bash
npm install
```

2. Start the local node and web app:

```bash
npm run dev
```

3. Open `http://127.0.0.1:5173`.

4. In the app:

- Create an email identity.
- Use `BETAoverride verify` in development.
- Claim weekly UBI from the dashboard.
- Send Aqua from Wallet; the UI shows the 4% Fire tax.
- Create a Chaos Chat room.
- Create a DEX pool, lock Aqua, and mint room credits.
- Create a proposal and vote.
- Use Sync and Import / Export for node sync and replayable bundles.

PowerShell note: if `npm` is blocked by execution policy, run the same commands as `npm.cmd ...`.
