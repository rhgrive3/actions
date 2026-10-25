# Special presentation CPU lane — 2026-10-25

Base: PR #1876 head `6dacd47095352cfd600f9c83012c71a2f298a460`. Runtime ownership is limited to `special-motion.mjs` and `special-presentation.mjs`. No GitHub Actions run or remote write was performed by this lane.

## Changes and preserved results

- **Trizooka / Ink Vac rigid hand fitting:** after the existing full `ch.kid.updateWorldMatrix(true,true)`, the final four error-measurement points directly apply the same current prop/hand `matrixWorld`. Previously each `localToWorld` call refreshed that object's ancestors again, even though the complete subtree was already current. The read-only error loop has no native callbacks. All constraint iterations and final native arm callbacks remain unchanged, and every fit still refreshes the full subtree after those callbacks. Socket/prop rebinding and parent/bone transforms therefore continue to be observed on every fit.
- **Killer Wail held speakers:** six devices share deploy easing only when their actual normalized `age / live deploy` input matches within the current pose, including mutation of the nested exported calibration object between devices. Equal current yaw inputs share the sine/cosine used to construct their axis-angle quaternion. Every use restores every quaternion component, including the original signed-zero multiplication. Per-device work still re-reads current inputs, and recomputes on a changed input. Firing speakers share the same `sin(t * 30)` glow, where `t` is already a captured pose timestamp. Caches are local to a single pose call, rather than actor state or a later frame.

The prop and hand objects are native THREE objects owned by the character rig. No geometry, material settings, device transforms, hand solver target, damage, paint, event, RNG, actor clock, network row, retained resource or state lifetime is changed. A preliminary socket-rotation cache was rejected after the real-rig counter showed no reduction on ordinary one-iteration fits; that candidate is not part of this lane.

Open PR #1870 was reviewed via `/workspace/shared/pr1870-special-patches.json` at `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`. Its Kraken point-block minimum and remote speaker roster/proxy changes are not duplicated or imported here.

## Evidence

`special-presentation-hotpath.test.mjs` executes complete frozen original `fit` and `pose` owners against the current owners. Frozen functions and original module SHA256s are retained in `fixtures/special-presentation-before-parallel.json`.

- Actual THREE-transform numerical checks cover 30/60/120 Hz, varying prop orientation and position, socket replacement/movement, arm-length changes, signed-zero yaw, live yaw/age/calibration changes between speaker devices, reused scratch quaternion mutation between device callbacks, and native/remote beam origins.
- Actual production-composed Character checks compare all pose channels, hand matrices, device transforms, visibility, muzzle, HP, ink, gauge and tokens exactly at 30/60/120 Hz for Trizooka, Ink Vac and Killer Wail. The sequence changes aim, moves actors, edits/replaces sockets, cancels and resets the actor. These use the real Character and its native hand solvers, with the fixture's existing physics/paint sinks.
- Final combined command: new source suite **3 passed** plus existing `special-presentation.test.mjs` **9 passed**, **12 passed with no failures/skips** after the final runtime revision. Syntax checks and `git diff --check` pass. The new frozen-function oracle explicitly rejects `INKWAVE_BUILT_SITE` rather than silently comparing optimized emitted code to itself, and fails closed when the source replacement anchor is not unique.
- The first local fixture run was rejected for an omitted unmodified `releaseWeapon` dependency. A later combined run exposed an incorrect six-unfired-speaker counter assumption after a previous test phase had already installed two beam origins. Both fixture issues were corrected; the original production-composed equality cases passed in those runs too. The final suite is reported separately and is not a relabeling of those failed commands.

Reproduction:

```sh
node --experimental-vm-modules --test --test-concurrency=1 \
  patches/splatoon3/tests/special-presentation-hotpath.test.mjs
node --experimental-vm-modules --test --test-concurrency=1 \
  patches/splatoon3/tests/special-presentation.test.mjs
node scripts/benchmark-inkwave-special-presentation.mjs
```

The benchmark exports `runPresentationBenchmark({repeats, iterations})`, alternates before/after order and returns raw times plus work counters. It times production-extracted owners with real THREE transforms and native callback sinks; instrumentation/snapshot allocation is disabled inside timed loops. Run it serially after concurrent workers stop. This lane ran only a short execution/parity smoke check, and makes **no timing acceptance claim from concurrent work**.

Deterministic reductions in that fixed workload: fitting retains all 8 quaternion rotations while matrix refresh calls fall **12 → 4**, eliminating the four final `localToWorld` ancestor walks. In each real Trizooka and Ink Vac Character trace, the redundant `localToWorld` calls fall **108 → 0** at 30 Hz, **228 → 0** at 60 Hz and **468 → 0** at 120 Hz, with identical recorded poses/matrices/muzzles/gameplay fields. Six unfired Wail speakers evaluate deployment powers **12 → 2**, and replace **six separate axis-angle quaternion constructions with one equal-input sine/cosine pair**. Direct firing glow sine evaluations are **6 → 1**. The number of devices and all resulting values remain equal.

## Retail comparison and remaining scope

Reference remains Splatoon 3 Ver.11.3.0 and the existing `reference/special-vfx.md` / special motion comparison notes. INKWAVE's procedural poses and device curves remain calibration; no new retail timing, joint curve or asset equivalence is claimed. Reproduce by aiming Trizooka / Ink Vac through high/low pitch, then cancelling and reactivating, or by activating Killer Wail and observing all six speakers before and after beam emission while turning.

These optimizations preserve the existing INKWAVE result rather than resolving its known retail differences. Full emitted-build/browser/GPU verification, actual Switch comparison and Safari/iPad performance are coordinating integration work; a CPU owner benchmark is not display-FPS evidence. The shared `reports/inkwave-splatoon3-behavior-2026-10-02.md` is intentionally left to the parent integration agent.
