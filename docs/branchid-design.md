# BranchID prototype — architecture and design

## Scope and source

Implemented against the October 2026 build instructions supplied with this task. The separate essay, “An Identity System Built on Trust, Not Perfect Proof”, was not present in the attachment or repository. Defaults below are experimental implementation choices, not claims about the essay. No global unique-human guarantee, federation, transfers, compulsory entry fee, account cap of eight billion, inherited vote weights or pruning is implemented.

This repository is an npm workspace, React 19/Vite web/PWA frontend with a direct-open fieldkit export. It is not an Android application. `packages/web/src/main.tsx` owns the existing navigation and wallet/chat/DEX/sync functions. `storage.ts` uses Dexie/IndexedDB (`aqua-web-v1`) and a memory fallback for direct-open files. Existing private keys remain in their existing browser store; this is not hardened hardware key storage. `packages/protocol` signs canonical JSON using noble Ed25519 and replays Aqua events. `packages/shared` defines the existing 480 Aqua weekly rate, Earth per-account ceiling, Fire and Sump calculations. `packages/node` is an HTTP/WebSocket relay backed by SQLite. It accepts gossip/bundles; timestamp-ordered DAG replay is not admission consensus. Existing governance publishes signed plaintext choices and supports proxies; it cannot supply the required secret, equal-member ballot mechanism.

## Module mapping

- `packages/protocol/src/branchid.ts`: versioned community policy, strict signed commands, membership/lineage, invitations, serial demo admission, signed chained receipts, replay, growth gates, review records and isolated simulated funding.
- `packages/web/src/BranchWorkspace.tsx`: Home, Community and Decisions; invitation creation/copy/review/acceptance; isolated multi-identity demo; pending queue; explorer and review workflow.
- `packages/web/src/branchid.css`: shared visual tokens, responsive sidebar/bottom navigation, cards, visible focus, system light/dark and reduced-motion support.
- `packages/web/src/KeyBackup.tsx`: passphrase-encrypted export and empty-profile restore using WebCrypto AES-GCM, PBKDF2-SHA256 with 250,000 iterations, random salt and IV. Existing public bundle export remains separate.
- `tests/unit/branchid.test.ts`, `tests/integration/branchid-journey.test.ts`, `tests/e2e/branchid.spec.ts`: protocol boundaries, separate-identity integration, demo isolation, retained legacy data and responsive browser evidence.

No new dependency, UI framework, database or transport was added. Existing ID Lab code, keys, event schemas, wallet balances, transaction history and monetary calculations are retained. Legacy protocol test controls are under Home’s expandable test tools; ID Lab, chat, voucher pools, read-only legacy ballot history, sync and backups are in More & settings.

## Trust and admission finality

No production BranchID service is configured. The relay has no ordering/finality mechanism adequate for scarce admission allocations. BranchID commands are deliberately not Aqua gossip event types, and the relay has no membership/bootstrap endpoint. Neither unauthenticated HTTP requests nor ordinary gossip can create BranchID membership.

The full working flow uses an explicitly isolated, in-memory **demo** authority. `BranchDemoAuthority.submit` executes synchronously: validates a command against a cloned state, produces a signed receipt containing sequence, previous hash, request, authority time and resulting state hash, then atomically replaces its state. Failed validation changes no membership, invitation consumption or success counter. Exact repeated commands return their existing receipt. Invalid signatures, unknown command fields, foreign communities, unknown dependencies and reordered/truncated receipt chains fail validation. Replaying requires a separately trusted authority public key; an archive's self-asserted key is not production trust. Four distinct founder keys and bootstrap provenance are signed into genesis.

This establishes one local demo order, not consensus, distributed uniqueness or a production service. Demo authority keys and identities are disposable browser-memory data. Refresh/exit discards the demonstration; the public log can be copied for verification but cannot restore its secret keys. Two unrelated browsers do not share a demo authority. No demo command, vote, key or payment is written to the legacy event database, sent to the relay, or admitted to a real payment job.

Outside demo, keys remain usable. Signed recipient-bound invitations can be inspected, and matching keys can sign a local admission request. Its state is **admission-pending**, stored under `aqua-branchid-pending-v1`. Unverified authority/sponsor names are not presented as trusted. There is no submission endpoint or automatic finalisation on reconnect. Pending requests confer zero votes and no payment entitlement. Users can copy requests. The simulated offline demo queue exercises deferred submission and explicit rejected/finalised outcomes against its single authority, including competing requests. No timestamp sorting is represented as finality.

## Versioned policy and allocation

Initial policy v1: exactly four founders at depth 0; 20 lifetime successful direct admissions each; every other member at most 10. Maximum depth 3, absolute lifetime occupied capacity 2,500. The first authorised tranche is depth 1/capacity 84. Depth 2 requires a successful vote to release 884; depth 3 requires another to release 2,500. Founders thereafter have exactly one ordinary vote and no special governance/review power. Membership IDs are derived from community and admission events, independently of current signing-key fields. Members have one immutable sponsor. A key already present, including a departed key, cannot join again. New children can only reference a previously admitted sponsor, preventing self-sponsorship and lineage cycles. Caller-supplied depth, root, vote weight and eligibility are rejected by strict schemas.

Invitations include community, sponsor signing key, recipient public key, policy version, random nonce, expiry and signature. No bearer link is used. Expiry is at most 30 days; UI default seven days. The invitation ID hashes the signed command. Issuing does **not** reserve a place: quota and capacity are checked again at final admission. Many outstanding invitations therefore do not bypass limits. The first valid serial acceptance uses its slot; later conflicting requests are rejected. Successful admissions consume sponsor quota and community capacity permanently even after departure. Unused invitations confer no rights. A gate policy change invalidates old invitations; sponsors must reissue them.

At opening, each growth proposal fixes allocations to admitted sponsors in the preceding generation. Divide the newly released tranche equally, floor each share, distribute remaining single places in stable member-ID order, and cap every share at 10. With all 800 depth-2 members present, the 1,616 depth-3 slots give two to each and a third to 16. Older generation allocations remain intact. Unused or capped surplus is held; it is not raced for, reassigned by founders, or automatically given to late sponsors. Reallocation would require an explicit future policy mechanism, not implemented here. Stable-ID remainder ordering can favour some identities and is not Sybil resistance. Closing the next gate too early can leave much capacity unavailable; this is a documented prototype trade-off.

## Growth ballots and privacy

Public **test** voting exists only in demo. Consent is required for each actor's signed public ballot. It has no real governance authority. The proposal fixes policy version, rationale, target generation, exact capacity, sponsor allocations and eligible-member snapshot. Only one open growth proposal is allowed, avoiding competing commitments. Members admitted later are excluded. One ballot per snapshot member, no proxies or founder multipliers. Seven-day authority-clock window; ballots at or after close are rejected. Anyone currently admitted can request evaluation at/after closing. Quorum is `ceil(snapshot size × 50 / 100)`; abstentions count toward turnout, not yes/no support. Strictly more yes than no is required (zero yes fails). A passing result increments policy version and records a signed authorisation command within the chained authority receipt. Failed votes retain the prior gate and all entitlements. Closing never raises the absolute cap/depth.

UI “advance clock” is explicitly a demo simulation control; it cannot establish production time. Public test choices are visible in exported signed history; hashing or pseudonyms do not make these ballots secret. Production expansion remains unavailable until a defensible private-ballot implementation and trusted ordering are integrated. Only aggregate community turnout is displayed. Branch choice and small/coincident cohort totals are completely omitted, so there are no complementary vote aggregates to reconstruct. Opposition or coordination is never treated as fraud.

The ancestry graph is public/pseudonymous with relationship-privacy costs, stated in invitation acceptance and explorer copy. Wallet history and secret keys do not enter it. Explorer search, zoom, collapsible founder branches and a list alternative render at most 30 members per page, bounding DOM work for 2,500 members. No tracking, fingerprinting, biometrics, contacts or IP surveillance is added. Existing optional ID Lab is preserved separately.

## Eligibility, money and recovery

Key-only, admission-pending, admitted and left are separate from review records. Recognised members have one ordinary demo vote. A review flag changes no membership/vote/payment rights. No legal assets or valuations are invented.

BranchID production entitlements are disabled (`productionEnabled: false`), not configurable through UI/local storage. The isolated funding pool starts with four weekly payments worth of **simulated** Aqua; the existing 480 Aqua rate and 100,000 Aqua per-member Earth ceiling are reused. Claims require admitted state, current UTC weekly period (same existing year/week algorithm), funding, lifetime ceiling and no prior member-period claim. The signed claim atomically debits the simulated pool. Entitlement, funding and paid status are separate. This pool is not a new real monetary policy and never changes existing wallets. Existing Aqua relay accounting remains a clearly labelled legacy simulation and is not represented as secured by BranchID.

Signing-key rotation and social/device recovery are not implemented. A new device should restore the same keys from encrypted backup; do not join with new keys to simulate rotation. There is no key-seizure endpoint. Stable member records separate the member ID from their authorised key, but future rotation must have a dedicated verifiable authorisation protocol. User-controlled display names are pseudonyms, not uniqueness evidence.

## Storage, migration and rollback

This release uses an additive namespace migration: existing IndexedDB schema **stays at v1**, and no existing row/key/balance is rewritten. No existing identity is made a founder or assigned a sponsor. The only new persistent BranchID data is versioned public pending commands in local storage; demo state stays in memory. Therefore there is no destructive DB upgrade to run or pre-upgrade data rewrite. The browser preservation test seeds an existing wallet/key/event queue, enters/exits the demo, reloads, and compares all three stores exactly.

Before changing browser/profile or downgrading, use More & settings → identity/settings → Encrypted key backup & restore. Download and retain the encrypted backup and passphrase separately. It includes legacy keys, events, queue and pending BranchID requests. Restore validates key/public-key correspondence and event signatures before a transaction writes into an **empty** browser profile; existing identities are never overwritten. Wrong-passphrase/corrupt files fail authenticated decryption. The public event bundle cannot recover private keys. ID Lab has its own unchanged store and is not included in this wallet backup.

Downgrading source does not require reverting a DB schema; old versions ignore the BranchID local-storage namespace. Keep encrypted backup and current browser profile. Removing that namespace loses pending requests only. Refreshing demo always discards simulated state. Do not clear browser site data as a migration step. No private backup is committed, logged or sent to a server.

## Reviews and limits

Observations include a 24-hour rapid-admission count, direct-branch and founder-subtree concentration, and a bounded count of rejected admission attempts on this demo authority (latest 100 retained). Rejections are local diagnostic observations, not signed accusations. They state time window and uncertainty; they are not a humanity score. A member can open a public evidence-reference case, the subject can respond/appeal, and the reporter may close their observation without sanctions. There is no punitive decision rule, deletion, suspension, financial penalty, ancestor punishment or expansion hold. The absence of adjudication rules is explicit. Only separately authorised economic data could justify financial diagnostics; none is collected here.

No QR scanner, federation, transferable membership, private-ballot cryptography, global Sybil resistance, production funding integration, secure key rotation or distributed admission consensus is claimed. Fraud percentages/genuineness assumptions are not admission guarantees and are not used to make decisions.

## Repeatable checks

From the repository in PowerShell:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
# In another terminal after the server starts:
npx.cmd playwright test tests/e2e/branchid.spec.ts --project chromium --workers 1
```

The browser spec includes 390, 768 and 1440 pixel layouts, screenshots in `output/playwright/branchid`, invitation → queued → final membership → public vote → signed growth gate → funded simulated UBI, validation errors, explorer, keyboard entry and preserved legacy database contents. The integration unit fixture is network-free and repeatable. `npm.cmd run fieldkit:build` refreshes direct-open distributions after source changes.
