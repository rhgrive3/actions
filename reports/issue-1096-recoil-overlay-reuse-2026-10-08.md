# Issue #1096 — recoil overlay reuse

## Scope

The current-main base is `c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb`. In `patches/splatoon3/runtime/weapon-detail-motion.mjs`, `withRecoil()` copied the native hold and recoil records on every tuned pose. The production `Character._poseWeapon()` reads the tuned `rc` fields, so removing the wrapper outright would change pose output.

The fix keeps one private hold/rc overlay per Character and reentrant call depth. It refreshes the overlay from the current native records on every entry, then applies the existing Shooter, Blaster, Charger, or Splatling tune. It never writes into the shared native hold record. The disabled, untuned, and missing-hold fast paths remain unchanged; `finally` restores the hold reference saved at entry.

No recoil tuning values or gameplay numbers changed. This is an internal allocation identity correction; it does not establish a Nintendo hardware allocation, GC, or performance figure, and it does not claim INKWAVE pose equivalence to Splatoon 3.

## Production evidence

The focused fixture composes all six source adapters in the same order as `scripts/weapons-fixture.mjs`, then runs the complete `patches/splatoon3/runtime/install.mjs` installer against the actual native `Character` and `Actor`. Each weapon completed 600 fixed 60 Hz production updates with exactly 600 `_poseWeapon` calls.

The pre-fix run counted distinct tuned hold/rc object identities. The count includes the additional recoil-trigger calls exercised by the firing schedule:

| Weapon | Current main | Fixed candidate |
| --- | ---: | ---: |
| Shooter | 620 | 1 |
| Blaster | 603 | 1 |
| Charger | 601 | 1 |
| Splatling | 640 | 1 |

For each weapon, the candidate's full pose, recoil spring, charger/breath, and installed-layer output digests exactly match the pre-fix current-main digests. The test also checks in-place `rc` mutations and getters, newly added native fields, switching among all four tuned weapons, shared-hold immutability, disabled detail motion, remote-flagged zero-time special-preview input, nested pose entry, and cleanup after callback or native-field getter throws.

The code change was checked against all ten cached fresh-open r443 actual PR diffs. Six touch `weapon-detail-motion.mjs`; none changes `withRecoil` or its `_poseWeapon` call. Four do not touch that module. The shared claim at `/mnt/workspace/inkwave-issue-claims/1096/claim.json` and duty comment [#1096 implementation assignment](https://github.com/rhgrive3/actions/issues/1096#issuecomment-6053270287) were preserved.

## Verification limits

Only the issue-focused full-composition tests were run. No full suite, CI, build, browser/device run, Nintendo hardware capture, heap/GC measurement, or device-performance claim was made. The change leaves gameplay and motion numbers unchanged, so the Splatoon 3 behavior-difference report was not amended.
