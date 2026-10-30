# Special projectile terminal VFX — 2026-10-30

Baseline: `fd6435a4dd2781928d211537c485c87bc50b3784` (`main`, PR #1944).
Implementation: [`special-vfx.mjs`](../../patches/splatoon3/runtime/special-vfx.mjs).
Regression: [`special-round-terminal-vfx.test.mjs`](../../patches/splatoon3/tests/special-round-terminal-vfx.test.mjs).

## Observed problem and change

`Director.updateRounds` previously called each non-Inkjet recipe's `impact` whenever a tracked projectile disappeared. Removing a round, clearing the projectile system or recycling its pooled object could therefore create a splash at the **last rendered position**, although the native simulation reported no burst. Conversely, a round that hit a nearby wall before its first rendered frame had no tracking record and could produce no special impact effect.

The director now uses the native `_blastBurst` callback for Tenta Missiles, Booyah Bomb, Ultra Stamp throws, Crab Tank cannon rounds, Trizooka and Ink Vac, as Inkjet already did. It snapshots the native terminal point before chained callbacks reuse scratch vectors, retires trail/core records and draws one impact per pooled lifetime. Disappearance only retires presentation records. Native airbursts on lifetime expiry continue to draw because the native simulation actually reports a burst.

The observer excludes deferred terrain snapshots without a live projectile position, pending/cancelled Trizooka globs and Crab shooter rounds. Reuse through `_new` resets the presentation identity even when the seed is unchanged. An Ink Vac that hits before first render still uses its native charge-scaled radius. The recipes, GPU capacities, gameplay, paint and network code are unchanged.

## Splatoon 3 evidence and limits

The existing [VFX reference](../../patches/splatoon3/reference/special-vfx.md) records Zephiel810's [“Splatoon 3 - All Special Weapons (DLC Included)”](https://youtu.be/PLxqXn_E898): broad projectile trails and impact splashes, including Inkjet at approximately 69.2 s and Tenta Missiles at approximately 179.9 s. That audit used 320×180 storyboards sampled about every 1.98 s. Its game version, per-chapter weapon and gear are unverified; it cannot establish frame timing, exact splash shape or whether any sampled disappearance was collision, expiry or cleanup.

This change corrects an **INKWAVE event-authority defect**. It does not claim newly measured retail timing or matching Nintendo particle counts. It preserves the native INKWAVE distinction between explicit terminal bursts and removal without a burst. The original effect appearance remains calibrated, and Switch/mobile rendering parity remains unverified.

## Reproduction

1. Render a special projectile so it acquires a director tracking record; clear its native projectile list or recycle it without `_blastBurst`. Baseline: the last position gains an invented impact. Candidate: its trail/core retires with no impact.
2. Fire the same special against a wall close enough to collide before first render. Baseline: no tracking record exists, so the special impact can be missing. Candidate: the native callback produces one effect at the native terminal point during that same update.
3. Repeat with a remote projectile decoded from a real `NetMatch` packet, or let the native projectile expire in flight. Cleanup remains silent; the native terminal still produces one effect. The 120 Hz Crab ghost can first simulate on outer tick 1 because its flight clock is 60 Hz; this test does not invent a first-outer-tick parity requirement.

## Verification

Node `v24.19.0` in the provided Linux workspace; CI's Node 22 was not available here. Source and emitted tests are CPU/Three object checks, not browser screenshots or retail measurements.

- New source suite: **149/149 pass**. Real composed `Projectiles`, `Physics`, CPU `PaintSystem` and `NetMatch`; actual Ink Vac exhale emission and all three delayed Trizooka globs; installed descriptors through native `_new`/`_push` for the other four special types. Wall, first-render contact, actor contact, native expiry and clear are exercised at 30/60/120 Hz. Accepted ghosts come from the actual serializer/decoder. VFX on/off receipts match for trajectory, native and deferred callbacks, paint-grid hash, outgoing packets, HP, special gauge and gameplay RNG calls.
- New component suite after the charged-radius assertion: **38/38 pass**. Covers callback arguments/receiver/result, scratch-vector reuse, deduplication, same-seed pool reuse, owner/team change, dead/removal/recycle/clear/dispose, pending births, malformed points and native exceptions.
- Production-minified emitted lifecycle suite: **111/111 pass**, comprising the three cadence groups and their 108 native lifecycle cases. Build content hash: `2c467f63e9201a63f3a0cb9429f9e6bdf266ed56d0c9b1edf4c01d2eca974c3c`. This run selects the actual built modules through `INKWAVE_BUILT_SITE`; it excludes the source-importing component cases.
- Baseline negative control: **12/12 selected cases fail** on the unmodified baseline, covering six missing direct terminal effects and six phantom removal impacts; the candidate source was restored immediately afterward.
- Existing Inkjet terminal, Ink Vac birth and Trizooka lobe suites: **48/48 pass**.
- Existing all-special VFX, restored round lifecycle and director hot-path suites: **40/40 pass**, including VFX-on/off gameplay independence and bounded pools across 30/60/120 Hz.
- Quick compatibility check, production build and deterministic startup budget: **pass**. The build uses the unchanged complete public input at `/workspace/actions/inkwave-public` and this worktree's patch sources.

Commands:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/special-round-terminal-vfx.test.mjs
node --experimental-vm-modules --test --test-name-pattern='native terminal snapshots|retires without impact|terminal observer|native exception' patches/splatoon3/tests/special-round-terminal-vfx.test.mjs
node --experimental-vm-modules --test patches/splatoon3/tests/inkjet-vfx-terminal-impact.test.mjs patches/splatoon3/tests/ink-vac-shot-vfx.test.mjs patches/splatoon3/tests/trizooka-lobe-vfx.test.mjs
node --experimental-vm-modules --test patches/splatoon3/tests/special-vfx.test.mjs patches/splatoon3/tests/queue-special-restored-20261026.test.mjs patches/splatoon3/tests/special-director-hotpaths.test.mjs
node scripts/check-inkwave-patches.mjs --quick
node scripts/build-inkwave.mjs /workspace/actions/inkwave-public _site-special-fx
node scripts/check-inkwave-startup-budget.mjs _site-special-fx
INKWAVE_BUILT_SITE=/workspace/actions-special_fx/_site-special-fx node --experimental-vm-modules --test --test-name-pattern='production terminal lifecycle' patches/splatoon3/tests/special-round-terminal-vfx.test.mjs
```

The [source log](special-round-terminal-source.log), [component log](special-round-terminal-components.log), [emitted log](special-round-terminal-emitted.log), [baseline control](special-round-terminal-negative.log), [existing regressions](special-fx-regression.log), [build log](special-fx-build.log) and [budget](special-fx-budget.log) retain the command results. The parent task records integrated verification. Its standard browser diagnostic exercises GPU pool lifecycles but does not directly verify these six terminal cases; no new browser/retail visual-parity claim is made here.
