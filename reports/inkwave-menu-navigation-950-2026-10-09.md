# Menu delayed-navigation ownership (#950)

Integration baseline: PR [#1182](https://github.com/rhgrive3/actions/pull/1182),
`1d669600609d439cab9874cb509440b7ae8a440a`, 2026-10-09 UTC.
Refs [#950](https://github.com/rhgrive3/actions/issues/950). Native
`inkwave-public/` remains unchanged. No separate PR or main merge is required.

## Scope: preserve the existing fix and cover its remaining boundaries

PR #1182 already repairs ordinary title interruption and disposal. This update
keeps those behaviors while using one timer owner for title and Mode navigation.
The runtime `_titleGo` replacement is retired; the transformed native methods
own timer identity and lifetime together. The runtime's retired-show guard
remains. The previous separate-main candidate is not stacked as a second owner.

Four failures were independently reproduced against exact PR #1182 production
sources using actual composed Menus methods and production installMenuQuality:

1. An invalid `show('unknown')` cancels the pending valid title confirmation,
   although the native navigation request itself is rejected.
2. A cancelled but already queued old title callback clears `_leavingTitle`
   during a new confirmation, admitting a second confirmation/sound/timer.
3. Mode → Main → Mode before 260 ms lets the old selection enter Setup during
   the later visit, without a new selection.
4. Disposal after the title timer fires but before the native wipe midpoint
   leaves the old `_swapToken` valid, allowing that queued midpoint to rebuild
   a screen and notify the screen-change API after disposal.

All four fail on the exact PR baseline and pass after this update. These tests
assert observable navigation, notifications and repeated-confirm admission;
they are not just checks for the presence of a new implementation field.

## Implementation

The build-only `menu-navigation-timer-adapter.mjs` binds each scheduled transition
to its timer identity, originating screen and accepted `_swapToken` generation.
Only accepted navigation cancels the old timer; redundant same-screen and
rejected invalid requests retain it. Forced same-screen replacement creates a
new generation and retires the old timer. Disposal clears the timer, advances
the native token (retiring queued wipes), and rejects later native show/title
requests. Mode card callbacks check their screen generation before modifying
settings, and stale callbacks cannot disturb a newer pending confirmation.

The original 350 ms title admission guard, 200 ms confirmation, Mode's 260 ms
or reduced-motion zero-delay, wipe machinery and selection values are retained.
No gameplay, movement, weapon, damage or Nintendo timing values are changed.
The new transformer is hashed by qualityIdentity and excluded from the shipped
runtime graph. PR #1182's three title-acceptance assertions are retained, now
using real composed methods rather than a fake method replaced by an installer.

## Verification

- Four public-behavior counterfactuals: exact PR #1182 **0 pass / 4 fail**;
  corrected **4 / 4 pass**.
- Title/navigation focused suite, including existing PR assertions: **26 / 26**.
  Covers normal/reduced timing, repeated confirmation, Settings/Main/null
  interruption, same-screen reentry/force, invalid/no-op navigation, queued
  stale callbacks, timer ID zero, disposal, queued wipe, stale Mode cards,
  20 lifecycle cycles, build identity and failed-anchor checks.
- Menu, continuation and build packaging selection: **52 pass / 3 skip**.
  Skips require emitted/build artifacts and are not counted as passes.
- Whole local-quality run: **735 pass / 5 fail / 8 skip**. Four failures also
  reproduce with the exact PR #1182 quality sources restored: two Boss/crablet
  damage expectations and two HUD fixtures missing `_clearTeamSpecialSignals`.
  The fifth was a file-level `bot-edge-guard.test.mjs` failure; its isolated
  rerun passes **10 / 10**. That rerun does not turn the failed aggregate into
  a whole-suite success.
- Production build succeeds, content hash prefix `f41e48f0b2ac`.
- `check-inkwave-patches --quick` fails because the PR baseline's numeric status
  is stale. This update leaves profile and numeric-status files byte-identical
  to PR #1182 and does not silently rewrite or claim that gate passed.
- `git diff --check` passes.

The earlier native Chromium attempt could not start because the environment
rejects its required local socket, including the permitted retry. No browser
success, physical device result or exact-head CI success is inferred.

## Splatoon comparison and evidence boundary

The repository targets Splatoon 3 Ver. 11.3.0. This is an INKWAVE DOM lifetime
and navigation defect; its retained menu delays are not claimed to be measured
Nintendo timing. Tests run actual composed methods with bounded DOM/time
fixtures, not physical touch/gamepad/browser rendering. Full-app browser and
exact-head GitHub CI remain independent acceptance gates.

```sh
node --test patches/local-quality/tests/menu-title-ownership.test.mjs patches/local-quality/tests/menu-navigation-timer.test.mjs
node --experimental-vm-modules --test patches/local-quality/tests/*.test.mjs
node --experimental-vm-modules scripts/check-inkwave-patches.mjs --quick
node scripts/build-inkwave.mjs inkwave-public <separate-build-directory>
```
