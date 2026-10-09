# Roller flick movement target (#373)

Baseline: main `83d6b088246f760a34d0921c118482bca7cde777`. Target is the published `inkwave-public/` plus its production build adapter; raw source, upstream lock, profile/numeric values, Character/hair/pose and network code are unchanged.

## Reference and concrete change

Splat Roller, Splatoon 3 Ver.11.3.0, pinned [primary parameter extraction](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json): both `WeaponWideSwingParam.SwingMoveSpeed` and `WeaponVerticalSwingParam.SwingMoveSpeed` are .048. Existing profile `moveSpeedFiring = 2.88` uses the established raw-per-frame ×60 mapping. Primary source hashes pass (11 files / 132 extracted fields / 14 unknown entries). This does not establish a new physical Nintendo-to-WU scale or claim Switch measurements.

Before: native `moveSpeed` interpolates from that target to 45% as `flick/flickWindup` grows. At nominal start/mid/end it is 2.88 / 2.088 / 1.296 WU/s, before existing gear/Flow modifiers. The vertical 26F windup even reaches the horizontal 21F denominator early. The profile's correct attack target is therefore progressively reduced by an unrelated pose-progress curve.

After: only an active Roller flick returns `w.moveSpeedFiring` at the existing native decision point. Lock, stream, charging and rolling branches retain their prior priority. The original fallback line remains for non-Roller hypothetical flick state. Actor acceleration/deceleration still approaches this target; no velocity snap or airborne integration replacement is introduced.

Reproduction: press main fire while grounded (horizontal) or airborne (vertical), hold movement, sample the actual `WeaponRunner.moveSpeed` throughout windup, and record the actual release and ink. Expected unmodified target is 2.88 at every windup sample, with release still after21/26 elapsed ticks and one8.5 ink payment.

## Explicit ownership boundaries

- Existing gear/Flow wrappers remain unchanged. Main's gear wrapper classifies windup differently from pending PR340, which adds `flick >= 0` to attack-state gear classification. This patch removes only the progress multiplier beneath either owner; it does not duplicate PR340's classification change. Tests ensure each installed modifier stays constant through the same windup.
- Post-release `flickRecover` and held-trigger rolling transitions are unchanged. This narrow fix does not certify their S3 equivalence.
- #393 does not require a new recovery implementation: current main `gear.mjs` already selects `verticalInkRecoverStop` at actual vertical ink consumption; PR340 separately refines rolling recovery. No duplicate #393 code is introduced.
- PR531's launch inheritance is distinct: this issue changes actor movement target during windup, not the rule mapping actual release velocity into projectiles. Their combined tests retain both.

## Validation

Focused actual native modules:5/5. Actual production-minified modules:5/5. Cases include horizontal/vertical target samples, exact release/ink, selected mode surviving landing, gear/Flow, Actor acceleration, hold-to-roll/dash, dry admission, lock priority, reset and other-weapon firing. Fixed60Hz traces match30/60/120Hz rendering.

A negative control uses the prior built536+531 tree without this movement adapter. Three root-specific target/Actor tests fail, while two unrelated transition/schedule controls pass. Numeric/source compatibility and production build pass. Full suite and integration receipts are recorded with the Draft PR; pending remote/browser tests are not claimed as physical-device acceptance.
