# PR 868 CI repair wave 4

Base6cb6d075d86b5e91d675c8cc6f75561f7a027a64. Main merge remains pending.

## Restored runtime connections
- Kit projectiles retain special identity/descriptor, recorded metadata, pooled retirement and their existing defense/fuse owners. Visual Trizooka side lobes do not acquire Boss hit ownership. Main and Slosher wall-drop cannot preempt a nearer accepted Kit defense. Finite Charger uses the existing defense contact. No Kit damage/timing constants changed.
- Refs #527: recover original PR536@9239be95 Roller buffered squid admission, using the existing13F profile. Keep #479 launch/freefall selection and #435 Slosher admission together.
- Refs #734: record the already-defined horizontal sector yaw for main Roller globs, as for existing near globs. Keep the existing damage tables, distance/group behavior and pool retirement.

## Verifier/source corrections
Current real projectile/Kit installation and35-field metadata are supplied to component fixtures. Charger tests wait the actual1F release gap and distinguish rejected enemy-ink form entry from accepted cancellation. Storm raw delivery and final0.1HP quantization are checked separately. Roller geometry keeps all vertex/grip/contact thresholds and samples final held contact after the current31+22F admission.

The SuperJump gameplay file had no bone/pose assertions but constructed a full procedural Character for every Actor. Measured first case was10.02s, with7.19s in Character construction. A render-only sink retains native Actor/Physics/Runner/_finishFrame and all gameplay assertions; all28 cases complete in6.70s. The separate HP file already completed quickly; its8 cases still pass. Both flight loops now use native duration-derived finite bounds and require successful retirement. This is not proof that every source-suite delay has been removed.

Cold mobile diagnostics showed a pre-Renderer progress/RAF wait even after the desktop page was closed. The verifier explicitly brings the new cold page to front before waiting.180s and all resource/identity checks remain unchanged. Actual cold success is not yet claimed.

## Evidence
Kit214 cases, existing Bomb fuse11, defense2, special projectile3; Roller527 thirteen cases plus Slosher7; sector7 plus missing-writer negative, replay4 and moving geometry1; Charger10; raw Storm12; SuperJump28+8. These are separately bounded lane results, not an aggregate unique count. Independent read-only reviews passed.

Composed294 source transforms, emitted build, startup145 hints and unchanged canonical15 weapon measurements passed. Canonical actual network3 and wall-drop4 families/6cases passed. Content e40b334019310ab779ef71b22af2ce7c702a23641f5cfa370ea4d6767e24e4a8. No timeout or numerical tolerance was raised. Whole source-suite/browser acceptance remains the next CI run.
