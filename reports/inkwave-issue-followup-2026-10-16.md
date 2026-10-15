# INKWAVE Issue follow-up — 2026-10-16 JST

Baseline main: `ee06c87fc623cc793ebf9aaffd3ffc3a5081c60a`. No gameplay runtime or source rates changed in this follow-up.

## #841 accepted: HP recovery during the actual Storm throw

The eight source contracts and eight actual emitted contracts pass without a failure. They retain the60F post-hit wait, natural0.21 HP per fixed frame, cap100, activation/exit single application,30/60/120 render scheduling and single allied-rain100 HP/s recovery. The8 source results belong to the same actual main audit; no full-audit pass is implied here.

The new browser checker boots the genuine range and uses native Q activation followed by Sub press/release. It requires the actual Storm device and later its real cloud; `throwStorm` and Actor methods are not stubbed. Nine controlled HP/damage-age/fully-charged-gauge cases pass: eligible50→52.73, fresh-damage50→50, cap99→100, each over13 actual fixed Actor ticks at render30/60/120. All ticks retain the ordinary non-submerged throw state and ink remains100. HP/rate/gauge setup is explicit; this is not a rapid-special-reuse or uncontrolled full-match claim.

Two earlier harness attempts correctly failed: the first only held the device without Sub release, and the next retained the legitimate8s gauge lock between independent cases. The final checker uses the real throw input and explicitly sets a fresh fully charged case. No production gate, rate or timeout was relaxed. Chromium SwiftShader is not physical hardware or measured Nintendo animation parity. The proprietary13F throw-origin calibration remains separate from this HP recovery bug.

Bounded receipt: [inkwave-storm-recovery-841-2026-10-16.json](inkwave-storm-recovery-841-2026-10-16.json). Reproduce: `CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-storm-recovery-browser.mjs BUILT_SITE PRIVATE_EVIDENCE_DIR`.

## Validation failures repaired

The current-main #287 settings reset test had a duplicate `normalizeViewSettings` import and could not parse. Removing only that duplicate restores2/2 native settings persistence/reset cases. Broader controller calibration remains independent and #287 is not closed by this change.

The live-log test assumed its parent would observe child output within30ms. Under contention, started/finished could arrive in one chunk. The child now waits for a file acknowledgement written only after the parent confirms progress was persisted and forwarded. All original assertions and the production logger remain unchanged:3/3 live-log contracts and16/16 complete workflow contracts pass.

## Other Issue evidence

#1467 and #1468 already have their implementation in independent PR#1465, head `6bc49ba22ec8a27a874e1e76e1463c812c91af9f`. Fresh source7/7 and rebuilt emitted7/7 pass; the Issues remain open pending integration and remaining browser/current-head acceptance. No duplicate runtime fix is introduced.
