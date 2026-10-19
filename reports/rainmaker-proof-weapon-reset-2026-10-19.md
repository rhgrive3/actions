# Rainmaker stationary proof: clear residual weapon actions (2026-10-19)

## Scope and confirmed failure

QA-only change based on main `fbed2d4ef5a2708307036c167d0a9df0461e8597`. The deployed Pages build identity and five owned gear/ranked runtime files matched the official artifact and public responses. The later [deployed ranked smoke](https://github.com/rhgrive3/actions/actions/runs/39226266615/job/117973196264) failed the Rainmaker attack assertion: one full-charge shot, expected direct/blast 60/180, but target damage callbacks were empty.

Official failed-browser artifact `12175536000`: 39,273,763 bytes, ZIP SHA-256 `a16dc2323cd188a997b1447272187cb102ffcab0b9daea532146df2929e6d266`. Its trace has the attack assertion error, zero HTTP responses >=400, no page errors, and the preceding capture completed with `contextLost=false`. This was an assertion mismatch; successful publication must not be relabeled a deployment failure.

The target was prepared at `[6.5,0,2]` with velocity zero and real ground support. After the 61 charge + 1 release + 20 recovery + 20 trailing updates, it was at `[6.992110151235887,0,-0.7101438833762784]`, alive. Resetting velocity alone does not clear a weapon action that moves the actor during subsequent updates.

## Reproduction and fix

The real Actor, WeaponRunner, Physics, RankedEngine and ranked combat consumers reproduce missed attacks when the target retains either a charged Splatana with recent forward input or a Dualies roll. The scene is a synthetic flat floor, with rendering/audio/paint stubs; this is not a physical Switch or recreated tidewater-map measurement.

The charged `s3-saber-lite` displacement length is `2.7544604316546755`, matching the failed target's displacement. Using the direction derived from the failure receipt reproduces its displacement components within floating-point error. Direction was deliberately derived; distance was not fitted. The old receipt did not include weapon/action state, so the historical failure's actual weapon cannot be conclusively identified.

The stationary-target setup now calls the existing native `target.weaponRunner.reset()` after validating real floor support. This clears native and catalogue charge/roll/slip/lunge state without modifying game runtime. Target receipts now include bounded weapon/action state before setup, after setup and after the attack. Invalid flight/Spawn targets remain rejected.

## Tests and unchanged gates

`patches/splatoon3/tests/ranked-browser-target-setup.test.mjs` executes the exact delimited browser setup callback, rather than a copied fix.

- Existing residual-velocity, unsupported-floor, flight/Spawn and strict-assert tests remain.
- Ordinary shooter and all three native Splatana IDs (`s3-saber-lite`, `s3-saber-normal`, `s3-saber-heavy`), with/without charge.
- Native Dualies rolls at 0/3/6 updates; catalogue `s3-maneuver-long` roll at 0/8 updates and its distinct post-roll slip at 20 updates, all entered via the real runner API.
- Every fixed action case retains damage `[60,180]`, splat, exactly one shot, stationary target, and a real Splash Wall `800 -> 380` with one shot and unchanged shooter ink/special.
- Candidate **7/7 pass, zero skipped**. Removing only the reset line gives **4 pass / 3 intentional failures** (charged Splatana, native Dualies, catalogue Dualies). Independent review repeated 7/7.

No shot/damage/wall assertions, timeouts, selection team predicate, boot lifecycle, runtime mechanics, retail tuning or existing failures were weakened. Current fixed-head browser/CI acceptance remains pending when this report was written.

## Source/build binding and reproduce

The official fbed harness/test/source-fixture blob identities were checked. Local execution reused the official b07 Pages artifact because direct emitted game/weapon/physics/ranked modules are byte-identical to fbed; fbed's only direct emitted differences are `index.html`, `styles/hud.css`, `patches/local-quality/splatling-reticle.mjs`, and `sw.js` (versioned paths also change revision prefix). Local 7/7 is not represented as a full new fbed build.

Canonical repository invocation, after the normal production build:

```sh
INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test patches/splatoon3/tests/ranked-browser-target-setup.test.mjs
node scripts/check-inkwave-ranked-browser.mjs _site reports/ranked-browser
```

The second command still requires the normal CI browser/toolchain. No local browser was run. Published-site smoke additionally requires the existing `RANKED_PUBLIC_URL` identity gate and must be verified against the eventual deployed source SHA, not the older public build.

The project's retail reference remains Splatoon 3 11.3.0; this change repairs stationary QA setup only. No new retail frame values or Switch-device parity claims are introduced. The existing Quick Super Jump startup calibration remains a separate unresolved measurement.
