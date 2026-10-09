# RESULT — INKWAVE issue #853 (lane cl5, reboot5)

- Issue: https://github.com/rhgrive3/actions/issues/853 — [INKWAVE][Bug] Dualies can swallow Splat Bomb release on the exact 4F post-shot unlock tick
- Base SHA: `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648` (branch start, verified `rev-parse HEAD`)
- Result commit: `f664d21e9759ef2bffae24615971c957121ed1d6` (evidence receipt, pushed nonforce to
  `origin/inkwave/c-853-cl5-reboot5-20261009`; final branch head after this docs edit is
  recorded in `claim.json` `completed_sha` and the issue comment below)
- Result comment: https://github.com/rhgrive3/actions/issues/853#issuecomment-6079639583
- Working Tree: `/mnt/workspace/.dev-state/agent-work/checkouts/inkwave-c-resume-20261009/cl5-853-reboot5`
- Branch: `inkwave/c-853-cl5-reboot5-20261009`
- Persistent Evidence: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-c-resume-20261009/cl5-853-reboot5`
- C claim: `/mnt/workspace/inkwave-issue-claims/853/claim.json` (owner=C, lane=cl5, status=REBOOT5_ASSIGNED; resume comment https://github.com/rhgrive3/actions/issues/853#issuecomment-6079207344 retained)
- Open/draft diffs checked: `pr-401-diff-reboot5.patch`, `pr-1180-diff-reboot5.patch`, `pr-1181-diff-reboot5.patch`, `pr-1182-diff-reboot5.patch` — none touches `patches/splatoon3/runtime/weapon-edgecases.mjs` or the buffered-sub logic

## Status: Root already solved on current main; acceptance boundaries closed with a regression test

Root at issue-creation main `787254fd` (verified via `git show`): `weapon-edgecases.mjs`
only synthesized an aim+release pair from `s3DualiesSubReleaseBuffered`; a real release
arriving exactly on the unlock tick while `s3DualiesSubBuffered` held the press was
dropped (0 bombs, ink untouched) — C's 2026-10-06 reproduction.

Already fixed on this base by `8c3ff5ba` (2026-10-08, `integrate(#1124)`, ancestor of
`5d0be6b7`), which added the exact fix direction from the issue:

```js
if (!lockedAtStart && (this.s3DualiesSubReleaseBuffered ||
    (kind === 'dualies' && this.s3DualiesSubBuffered && source.subReleased))) {
  sub = true; subReleased = true;
  this.s3DualiesSubBuffered = false; this.s3DualiesSubReleaseBuffered = false;
}
```

The outer `sub-ready.mjs` preparation owner (5F preparation + 1F use-startup) stages the
release, the pair is synthesized once at admission, and native `weapons.js::update`
(`aimingSub`) throws exactly one Splat Bomb for exactly one 70-ink payment. The C
comment of Oct 6 already recorded that PR #868 `496cc8f91dbc6af7510182394b6dec3546ea970d`
fixed the same root through another admission path without an explicit link; the
saved `10b54ec30068d48eb67731a1fdc6f6927c678f39` proposal stays archived and no
duplicate production fix is submitted here. No open/draft PR diff in the reboot5 set
touches this site, so current main is the sole owner of the fix.

## Changed Paths

- `patches/splatoon3/tests/weapon-edgecases.test.mjs` — new `#853 Dualies buffered sub
  boundaries` regression (release 1F before / exactly on / 1F after the 4F unlock,
  insufficient-ink rejection, death clearing both buffers; each asserts exactly-once
  throwing, no late duplicate, and both buffered flags false)
- `reports/inkwave-splatoon3-behavior-2026-10-02.md` — dated #853 comparison record
  (S3 reference basis, root/fix site, reproduction, impact, honest unverified labels)
- `RESULT.md` (this receipt)

No production source changed: duplicating `8c3ff5ba`'s fix would only churn main.

## Tests (this lane, base 5d0be6b7, `node --experimental-vm-modules --test`)

- Focused 3-file run this lane (`weapon-edgecases` + `catalog-dualies-clock` +
  `issues-1041-1047-action-windows`, log
  `evidence/.../cl5-853-reboot5/focused-853-3files.log`): **38/38 pass, 0 fail,
  0 cancelled/skipped/todo** (38.9 s). Covers the existing unlock-tick replay test, the
  new #853 boundary test, the 30/60/120 Hz fixed-step identity test, the #1047
  4F-shot-gate interruption windows (adjacent to #815's gate) and the composed Dualies
  clock catalog.
- Standalone boundary probe on the same base
  (`evidence/.../cl5-853-reboot5/probe-853-boundaries.log`): unlock-tick release →
  1 bomb / ink 100→31; release 1F before unlock → 1 bomb; hold through unlock, release
  1F after → 1 bomb; ink 50 < 70 → 0 bombs; press under lock + death → both buffers
  cleared, 0 bombs; slosher analog also observed throwing 1 (outside #853 scope,
  observation only). 30-tick drains show no duplicate throw.
- `#815`'s 4F post-shot gate (`s3DualiesPostShot = 4/60`) is untouched; its clock and
  interruption-window tests are part of the 38/38.

## Remaining work

- None for #853's acceptance on this base. Open observations, recorded not fixed here:
  insufficient-ink rejection cancels inside `sub-ready.mjs` before the inner wrapper
  sees a release edge, so `s3DualiesSubBuffered` can remain true until the next
  admission/reset/death clear — no behavioral residual (0 throws, flags clear at the
  next admission), noted for a future small-state-machine cleanup only if a real bug
  appears.
- Honesty labels: all verification is Node fixed-step fixture logic. No emitted-browser
  run, no two-device network session, no Switch capture. Whether Splatoon 3 Ver. 11.3.0
  hardware accepts a sub release on the exact 4F recovery unlock frame is not documented
  in public sources (Leanny `splat3` 11.3.0 parameters do not expose input buffering);
  hardware fidelity remains **unverified**, and this work only guarantees INKWAVE never
  loses a valid release at that boundary.
