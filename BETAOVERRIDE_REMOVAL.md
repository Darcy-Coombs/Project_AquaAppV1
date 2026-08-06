# BETAoverride Removal Notes

BETAoverride is temporary development verification only.

Current guardrails:

- Config flag: `betaOverrideEnabled`.
- Production guard: `assertProductionSafe` throws if production enables BETAoverride.
- UI marks BETAoverride verified identities clearly.
- Events use `verification_method: "BETAoverride"`.
- Unit tests assert production cannot enable it.

Removal path:

1. Set `betaOverrideEnabled` default to `false` in all modes.
2. Remove the `BETAoverride verify` button from `packages/web/src/main.tsx`.
3. Remove `BETAoverride` from accepted verification methods in protocol schemas.
4. Remove BETAoverride-specific tests and fixtures or rewrite them to PoHW-lite.
5. Run `npm test`, `npm run build`, `npm run lint`, and `npm run typecheck`.
