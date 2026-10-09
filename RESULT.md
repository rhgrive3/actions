# RESULT — INKWAVE issue #272 (cl6, currentmain 59041049)

- Issue: https://github.com/rhgrive3/actions/issues/272 — Stealth Jump Ver. 11.0.0 distance-based flight penalty.
- Base SHA: `590410494a3e041a403398e191b7d95183912ea2` (origin/main, verified exact match; branch `inkwave/c-272-cl6-currentmain-20261009` has zero diff vs main before this work).
- Claim: `/mnt/workspace/inkwave-issue-claims/272/claim.json` owner=C, lane=cl6, timestamp 2026-10-09T14:03Z; duty comment https://github.com/rhgrive3/actions/issues/272#issuecomment-6075313881.
- HEAD after work: `35367ecb3625f686240d2a6679dcd441d6b9906a` (pushed, no force; see commit log).

## Changed files (scoped, no force)

1. `patches/splatoon3/runtime/gear.mjs` — one-token production residual: gear-panel filter exempts fixed-main `stealthJump` exactly like `ninjaSquid` (`id !== 'stealthJump'`). No `inkwave-public/` edit, no formula/level/network/Range change, no invented scale/foci.
2. `patches/splatoon3/tests/gear-sub-batch.test.mjs` — added one #272 probe (shoes-main visible, head-main/shoes-sub hidden, ninjaSquid control, non-local equip sets `modifiers.stealthJump`); restored the pre-existing #267 case untouched; added missing `abilityAllowed` import.
3. `reports/inkwave-splatoon3-behavior-2026-10-02.md` — appended dated #272 section with 本家根拠 / 実装箇所 / 再現操作 / 影響 / 確認状態; no prior section edited.

## Source / overlap proof

- Full issue body saved to `evidence/.../cl6-272-currentmain/issue-272-live.json`. Only comment is the 2026-10-07 local-batch duty note (>3h stale, no code, no branch); takeover authorized per prompt.
- Live open PRs rechecked 2026-10-09: 1174/1173/1172/1171/1170/1169/1168/1148/401 — none claims #272, none touches `stealthJump`/panel filter (cached `pr-*-reconcile.diff` heads match live heads: 1174 `3cab2202`, 1173 `e20bc772`, 1172 `5e0af85c`, 1171 `04e4547c`, 1170 `2fa7ba36`, 1169 `8ce499a4`, 1168 `eadc3fdf`, 1148 `b347211b`, 401 `387b87d3`).
- No linked/closing PR on the issue (`closedByPullRequestsReferences: []`).
- No other shared claim for 272 (`/mnt/workspace/inkwave-issue-claims/272` did not exist before this lane; other lanes own 735/93/etc., no overlap).
- Commit `6c7026aa fix(jump): add Stealth Jump flight penalty (#272)` is already in main history (adds `superjump.mjs` curve + `abilityAllowed`/modifier/flight wiring); this lane finishes only the leftover production selection residual.

## Primary sources / units verified before edits (real root, no invention)

- `SplPlayer.json` (Leanny raw @7280ff9, fetched 2026-10-09, saved in evidence): `spl__PlayerGearSkillParam_SuperJumpSignHide` = `ExtraMove_DistXZMax 100.0`, `ExtraMove_DistXZMax_Tcl 100.0`, `ExtraMove_FrmMax 60` (frames @60Hz). Matches existing constants; exact distance curve beyond linear ramp NOT assumed.
- `GearTraits.json` (Leanny raw, fetched 2026-10-09, saved in evidence): `SuperJumpSign_Hide KindLimit Shoes`. Matches shoes-main-only rule.
- S3 Wiki `Stealth_Jump` (fetched 2026-10-09): shoes-restricted primary; Ver. 11.0.0 flight-only penalty up to ~1s, ramping 60→100 units. No unpublished frame value invented.

## Tests (focused only, no broad suite)

- `gear-sub-batch #272` probe: 16/16 pass (`focused-regression.log`); pre-fix run failed only on the missing import, then on the panel omission — proof the residual was real (`focused-before-fix.log`).
- `issue-272-stealth-jump` 4/4 pass (slot, XZ-only 60..100/0..60F, fail-closed foci, QSJ composition).
- `issue-460-marker` + `issue-460-gauge` 10/10 pass (marker lifecycle, concealed hook untouched).
- `superjump-startup-form` 7/7 pass incl. 30/60/120Hz parity (`superjump-startup-form.log`, ~162s).
- `continuation-gear-flow` 3/3 pass (gear panel owner intact).
- `gear-sub-batch` full file 16/16 pass (includes pre-existing #193/#235/#245/#298/#267).
- Affected network (`patches/network-replication/adapter.mjs`) and Range (`patches/practice-range`) guards inspected: Super Jump replication carries phase/age/destination only, no stealth flag; no guard changed, correctly, since no protocol change is made here.

## Unfinished acceptance (NOT solved — partial only)

- No calibrated `level.stealthJumpFoci` exists for any shipped INKWAVE stage; production flight therefore still adds 0 by design (fail-closed). Do not count this as the distance penalty working end-to-end.
- Owner/remote arrival-gauge marker concealment for equipped Stealth Jump is NOT wired (both flight branches pass `concealed: false` implicitly; remote `superjump` event carries no stealth flag). Remote opponents still see the ordinary cue. Separate protocol/presentation work required.
- Exact-head CI and browser acceptance for this branch not run/claimed.
- Pre-existing `subPower` display-string mojibake (`cµブ性能アップ` in `ABILITIES`) observed but deliberately untouched as out-of-scope for #272.
