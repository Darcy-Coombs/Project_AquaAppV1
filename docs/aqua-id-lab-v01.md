# Aqua ID Lab v0.1

An isolated experiment within the existing React/Vite Aqua application. Open the
**Aqua ID Lab** navigation tab. No email or existing Aqua identity is needed.
The old Identity, voting, wallet and relay flows are unchanged. Lab credentials
are not accepted as protocol identities, voting rights, or UBI eligibility.

## Demonstration and limits

Create a passkey and private random Aqua root, complete a roughly 25–30 second
interaction ceremony, inspect three scoped pseudonyms, cast a test vote, repeat
it to see rejection, verify credential control, and renew the pseudonyms.
The combined local display demonstrates common-root derivation without displaying
the root; it is not a public cryptographic proof of that relationship.

**CURRENT LIMITATION:** Aqua ID v0.1 does not prove that one human can possess only
one Aqua identity. Another device/profile/browser can enrol another root. Clearing
site storage also permits enrolment again and resets the local vote simulation.
The ceremony is automatable and is only experimental evidence of contemporaneous
interaction. A passkey proves credential control, not a unique person, device,
or real-world identity. Nothing here implements global Sybil resistance,
network consensus, zero-knowledge credentials, or production anonymous voting.

```text
Human/device interaction
        ↓
Private Aqua root
        ↓
  ┌─────┼──────────┐
  ↓     ↓          ↓
Voting  Chat       DEX
ID      ID         ID

Private Aqua root
        ↓
event/action scope
        ↓
one deterministic nullifier
```

## Minimal integration

- `packages/web/src/main.tsx`: import and one navigation tab/page.
- `packages/web/src/id-lab/`: isolated UI, ceremony, Web Crypto derivation,
  WebAuthn verification and Dexie database; reuses Aqua's CSS conventions.
- `tests/unit/id-lab.test.ts`: domain logic and actual signed assertion checks.
- `tests/e2e/id-lab.spec.ts`: existing Playwright framework and Chromium virtual
  authenticator, including desktop and 360px viewport flows.

No new dependencies, server routes, analytics, AI/LLM components or identity
providers. Existing protocol key storage is deliberately not reused: the lab
uses non-extractable keys and never joins the existing event/export pipeline.

## Data model and storage inventory

Database: **`aqua-id-lab-v01`**, schema version 1, IndexedDB via existing Dexie.
There is no localStorage or in-memory persistence fallback.

| Location | Stored fields |
| --- | --- |
| `identities`, primary key `id = root` | Non-extractable HMAC `rootKey`; ISO `createdAt`; integer `epoch`; `authentication`; `records` |
| `authentication` | Base64url credential ID, SPKI public key, algorithm `ES256`, RP hostname, origin, random 32-byte user handle |
| `records[]` | Epoch; challenge version `aqua-presence:v1`; random 32-byte challenge ID (hex); ISO completion time; passed `true` |
| `used`, primary key `nullifier` | Full nullifier, action scope, ISO accepted time |
| Browser/authenticator, outside Aqua storage | Passkey private key and authenticator's RP/account metadata; possible passkey-provider sync governed by OS/browser settings |

The `root` key is a constant database row name, not a public identity. The HMAC
key is generated with Web Crypto (`HMAC`, SHA-256, 256 bits, `extractable: false`,
usage `sign`) and persisted using IndexedDB structured clone. No raw secret is
displayed, stringified, logged, put in URLs, or sent to a server. Root extraction
is disabled; this is not encryption at rest or a hardware security guarantee.

Only completed enrolments/renewals are saved. Pending root/credential, random
targets, round number, countdown deadline, fresh WebAuthn challenges/assertions,
UI status and derived identifiers exist in memory. There are no saved tap times,
target sequences, raw behaviour traces or verification-history timestamps.
Creation/renewal timestamps themselves remain potentially correlatable metadata.
All public-display records use an explicit allowlist, including nested records.

Registration supplies the authenticator a random user handle, account name
`aqua-` plus the first 12 hex characters of that handle, display name
`Anonymous Aqua ID`, RP name `Aqua ID Lab`, RP hostname, random challenge and
ES256 parameters. Authentication supplies a fresh random challenge and credential
ID. The response is verified locally and discarded; attestation is requested as
`none`, and hardware IDs, transports, counters and attestation objects are not
retained. An authenticator may use its own unlock method. Aqua does not request
or receive biometric samples. OS passkey sync is separate from Aqua root storage.

No name, email, phone, date of birth, government ID, address, GPS, location history,
contacts, photograph, biometric, advertising or fingerprint identifier is
requested/stored by this lab. Random credential IDs/user handles are credentials,
not device fingerprints. The Privacy Inspector shows the actual non-secret
database records, derived identifiers and local nullifier set. Its scope is
explicitly this lab; other Aqua screens have their own data and network behaviour.

## Cryptographic derivations

All randomness is Web Crypto, including fresh 32-byte WebAuthn challenges.
Strings use UTF-8 and exact case-sensitive scope names. JSON tuples prevent
ambiguous scope/epoch boundaries. No custom cryptographic primitives are used.

```text
pseudonym = "aq_" + hex(HMAC-SHA-256(rootKey,
    "aqua-scope-id:v1:" + JSON.stringify([scope, epoch])))

nullifier = hex(HMAC-SHA-256(rootKey,
    "aqua-nullifier:v1:" + JSON.stringify([actionScope])))
```

The cards abbreviate identifiers; full 256-bit values appear in the inspector.
The example scopes are `Voting`, `Chaos Chat`, `DEX`; the action is
`demo-election-001`. Renewal increments the epoch, appends a fresh ceremony
result and changes each public pseudonym. **It preserves the underlying root,
authentication passkey and action nullifier.** A renewed identity therefore
cannot recast that event's vote. Nullifier check-and-insert is a single IndexedDB
transaction across tabs. Renewal also checks for a stale/deleted/replaced local
identity inside a transaction. Enrolment uses `add` so tabs cannot overwrite it.

## Control and ceremony

Enrolment requests a user-verified ES256 passkey with no attestation and verifies
an assertion from it before generating the root. This may prompt twice. Each
Verify Control and renewal starts a fresh random assertion challenge. Verification
checks credential ID, optional returned user handle, client type/challenge/origin,
cross-origin flag, RP ID hash, user presence and user verification flags, and an
ECDSA signature over authenticator data plus SHA-256(clientDataJSON). The small
DER-to-raw routine converts standard signature encoding for Web Crypto; it is
not an invented signature algorithm. No assertion is accepted just because the
browser returned an object. Sign counters are not treated as uniqueness evidence
or a hard anti-clone signal because synced passkeys can use zero/non-monotonic
counters. See the [WebAuthn specification](https://www.w3.org/TR/webauthn-2/).

The ceremony has five random target-selection rounds with five-second minimum
waits, using a monotonic clock. It is keyboard/touch accessible. It records only
the version, unpredictable challenge ID, completion timestamp and pass state.
These records are local claims, not signed remote proofs of human presence.
Cancel/navigation/reload discards unfinished ceremony state. A passkey created
before cancellation/storage failure can remain in the authenticator and may be
removed using its credential manager. Failed/cancelled renewal preserves the
existing identity. A fresh attempt requires new verification and a new ceremony.

## Privacy and threat model

With an uncompromised random root and HMAC, separate context identifiers do not
directly disclose their common root. Revealing the combined inspector links them.
Stable pseudonyms link activity within a scope/epoch, and deterministic nullifiers
intentionally link repeated actions in an event. IP addresses, timing, usage,
credential metadata, colluding contexts, and the host application remain possible
correlation sources. This is not a general anonymity guarantee.

Lab identity records are never sent to a server and are excluded from Aqua public
bundles and relay queues. Serving/downloading the app still makes ordinary web
requests and exposes request metadata to its host. Future context requests would
share only that context's pseudonym; event verification would share action scope
and nullifier, never the root or full inspector. No such network path exists yet.

Trust boundary: local application code, same-origin storage, browser, OS and
authenticator. Malicious same-origin JavaScript/XSS, extensions, developer tools,
or device compromise can use a non-extractable root, alter local records, bypass
UI passkey gates and simulate completion. The passkey is associated with the
root in the local record; it does not encrypt or hardware-bind the root.
WebAuthn protects credential operations, not the whole local database. The vote
set is only a simulation of a future replicated/decentralised check, not a network
authority. It provides no defence against storage rollback or deliberate editing.

IndexedDB deletion/eviction, a new profile, a different origin, or loss of the
authenticator are ordinary failure modes. No recovery/export mechanism is built.
The passkey alone cannot recover the Aqua root. Loss of the passkey means the
retained root cannot be renewed through the UI. Keep the same origin, port and
profile when testing; phone and desktop local storage remain distinct.

## Running on desktop and Android

Desktop: from this repository run `npm.cmd run dev`, open
`http://localhost:5173`, then choose **Aqua ID Lab**. Use a current WebAuthn/ES256
browser and configured authenticator. No legacy Aqua onboarding is needed.
The desktop launcher opens `localhost`. If an older bookmark uses `127.0.0.1`,
change that hostname to `localhost`. Although loopback IPs can be secure contexts, WebAuthn
RP IDs require a valid hostname; the lab detects this and explains the change.

Plain LAN HTTP from `PHONE_TEST_AQUA.cmd` is **not** a secure WebAuthn origin.
Downloaded `file:` copies are explicitly blocked for lab enrolment. The smallest
local Android setup uses Chrome USB port forwarding, without a deployment change:

1. On Windows, in this repository run `npm.cmd run dev`. Leave it running.
2. On Android, enable Developer options and USB debugging. Connect a USB data
   cable and approve the computer's debugging prompt. Configure an Android screen
   lock/authenticator if Chrome asks for one.
3. In desktop Chrome open `chrome://inspect/#devices`, enable **Discover USB
   devices**, and find the connected phone.
4. Click **Port forwarding**, add device port **5173** mapped to
   **localhost:5173**, and enable port forwarding.
5. In Android Chrome open **http://localhost:5173**. This is the phone's forwarded
   localhost secure context, not your computer's LAN address. Open **Aqua ID Lab**.
6. Select **CREATE AQUA ID**, complete the passkey prompts and five challenge
   rounds. Inspect the three IDs; cast a test vote twice; verify control; renew
   and confirm the epoch/IDs change while another test vote is still rejected.
7. Open **WHAT DOES AQUA KNOW?** to inspect the records. Keep the same browser,
   origin and site storage for subsequent control/renewal checks.

The lab does not require the relay port. Forwarding 8787 is needed only if you
also want to exercise the existing Aqua relay features on the phone. See
[Chrome's port-forwarding instructions](https://developer.chrome.com/docs/devtools/remote-debugging/local-server).
Alternatively serve the production build on trusted HTTPS, or use the existing
Codespaces HTTPS forwarded web URL. Enrol separately on that stable origin.
No insecure-origin browser flags or weak authentication fallback are used.

`npm.cmd run build` creates the production app in `packages/web/dist`.
`npm.cmd run fieldkit:build` also regenerates the existing root and fieldkit
single-file distributions; use HTTPS when serving them for this lab. Publishing
or changing the deployment is outside this experiment.

## Checks and next experiments

Run `npm.cmd test`, `npm.cmd run test:e2e`, `npm.cmd run build`, and
`npm.cmd run lint`. E2E uses a virtual authenticator and real 25-second ceremonies
for both enrolment and renewal; it does not prove a physical phone works. Test
your Android authenticator using the steps above. The E2E suite checks renewal
rotation, cross-tab/persistent duplicate rejection, cancellation, storage loss,
unsupported browsers, absence of lab POST requests and viewport overflow.

Next bounded experiments: recoverable root custody without a central authority;
replicated nullifier validation and rollback resistance; signed evidence with
explicit issuer/trust assumptions; context-specific privacy proofs; recovery and
passkey replacement; consent and retention policies for independent evidence.
Future providers should contribute evidence rather than possess unilateral
identity issuance/revocation authority. v0.1 introduces no learned human detector,
AI/LLM, Jev, Laya, PT scoring, or claimed uniqueness metric.
