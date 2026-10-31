# BranchID validation — 31 October 2026

Repository: `C:\Users\David\Documents\Poj_Aq_build_goalbuild` (the location named in the supplied instructions, rather than the older open browserbuild workspace).

Branch: `codex/branchid-modern-ux`. Existing uncommitted RUN instructions, launcher changes and ID Lab additions were preserved. Existing ID Lab tests received only navigation updates for the secondary menu. Old generated root/fieldkit HTML was copied to `C:\Users\David\Documents\ProjAq_browserbuild\.branchid-work\preexisting-artifacts` before regenerating it from the retained source.

## Checks

- `npm.cmd test`: **42 passed**, including all 28 original unit/integration tests and 14 new BranchID tests. Covers signed provenance, recipient binding, self/duplicate membership, no caller-supplied lineage, expiry, founder and ordinary quotas, concurrent last-slot conflicts, absolute/released capacity, depth, deterministic fair-share allocations, policy tampering, missing/reordered dependencies, idempotence, snapshots, quorum rounding, majority/tie handling, competing proposals, duplicate/funding-limited claims, review rights and suppression of branch-choice diagnostics.
- `npm.cmd run build`: successful TypeScript project build and Vite production build, with no new dependencies.
- `npm.cmd run fieldkit:build`: successful; both direct-open HTML distributions refreshed from the existing source, including ID Lab and BranchID.
- `npm.cmd run test:e2e`: **30 passed** across Chromium desktop and 360px mobile projects. Includes the existing onboarding, Run, sync, install, direct-open and ID Lab tests, plus separate-identity BranchID admission, offline/reconnect, public-consent growth vote, funded simulated claim, non-punitive reviews/responses/appeals, persistent pending real-key admission, encrypted backup/restore and exact existing database preservation.
- Final focused BranchID browser run after the backup transaction and pending-queue changes: **14 passed** (`npx.cmd playwright test tests/e2e/branchid.spec.ts --workers 2`, with `AQUA_WEB_URL=http://127.0.0.1:5178`). The suite exercises encrypted backup/restore, queued/reconnected admission, real pending requests and demo isolation.
- Browser screenshots at **390, 768 and 1440 pixels**, with no horizontal document overflow in the responsive checks; explorer search/list/zoom, validation errors, keyboard entry and primary navigation exercised. Home and Community screenshots were visually inspected.

The first full browser run had two stale legacy navigation expectations because the test-tool details section remounts closed when returning Home. The tests now explicitly reopen it; the next full run passed. No protocol assertion was removed to make the tests pass.

## Evidence

Screenshots are local generated artifacts under `output/playwright/branchid`:

- `home-390.png`, `home-768.png`, `home-1440.png`
- `community-390.png`, `community-768.png`, `community-1440.png`
- `decisions-390.png`, `decisions-768.png`, `decisions-1440.png`

## Boundaries of the checks

These are local Chromium tests, not a physical-phone battery/performance study or a security audit. The explorer bounds rendered rows at 30; a full 2,500-person device benchmark was not performed. Dark mode and reduced-motion styles are provided, but no claim of exhaustive accessibility certification is made. QR scanning is not implemented. There is no tested production admission service, private ballot system, global human uniqueness, real-money integration or key-rotation protocol: those capabilities are deliberately unavailable. Node printed its existing experimental SQLite/loader warnings; startup and tests nevertheless passed.

No original identity was migrated into founder status, no legacy balance was rewritten, and no existing monetary rate or Fire/Sump calculation changed. Demo history is ephemeral; the public signed archive can be exported but does not contain keys. See `branchid-design.md` for finality, privacy, funding, allocation and downgrade/recovery rules.
