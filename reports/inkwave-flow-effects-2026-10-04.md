# Flow ability composition: #181 / #222

These two open issues describe one remaining public-runtime defect. This change
does not count them as independent features. Main was rechecked at
`404c66c858cfea14e81225fb6364febcf2c9c528`. Its public source, patches and workflows
are byte-identical to the locally available `0859bf4f` baseline; the intervening
main changes are confined to `tools/inkwave-modeler/`.

## Reference and limits

- [Nintendo v11 overview](https://www.nintendo.com/au/news-and-articles/whats-new-in-the-splatoon-3-version-11-update/)
  explicitly names Run Speed Up, Swim Speed Up, Ink Resistance Up and Intensify Action.
- [Diam's original analysis](https://bsky.app/profile/did:plc:bqlxkhq26ie3xvvjv5kjae3r/post/3mdramqcbbs2o?ref_src=embed),
  dated 2026-02-01 UTC, was read directly, including the image alt descriptions.
  It specifies +30 AP for those four abilities, additive with the ordinary 57 AP cap.
  This is primary community analysis, not a Nintendo-published numeric table or a
  new physical Switch measurement. The author also notes testing limitations.
- [S3 verification wiki](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%82%A4%E3%82%AB%E3%83%95%E3%83%AD%E3%83%BC)
  independently describes +30/cap57. It is corroboration, not the primary numeric source.
- [Nintendo update history through v11.3.0](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html)
  documents the effect set and later network-paint fix; no later AP change is listed.
  Absence of a listed change is not a new device measurement.

All existing nonlinear ability curves and unit conversions are reused. Their
pinned extracted-source provenance and physical-world scale limitations remain.
The `numeric-status.json` convention still conservatively classifies the new AP
field as non-extracted; its explicit provenance is in the Flow profile and here.

## Reproduction and change

The public source is passed through the production adapter and actual installers.
With no equipment and Blaster, ordinary turf/splat events entered Flow. Previously
run speed changed 5.76→6.912 WU/s while roll retention0.85, surge scale1,
enemy-ink rate18 HP/s, cap40, jump4.8 WU/s and air spread10 were all unchanged.

`runtime/flow-effects.mjs` now refreshes the four temporary AP-derived abilities
on activation, expiry, equipment replacement and before native update/movement.
The existing reset/death clears notify the same refresh. Flow duration, extension,
threshold, weights, paint and death/reset policy are unchanged.

- Resistance reaches the existing movement, damage-rate/cap and jump consumers.
- Intensify Action reaches the actual surge/roll consumers and weapon-specific
  airborne spread curve. The pristine weapon is the source for each recomputation.
- Run/swim speed uses the same capped AP curves as equipment. The old independent
  1.2/1.5 multipliers are removed from the primary path. Legacy profile multipliers
  remain as identity1 so pending adapters cannot reintroduce a second bonus.
- The actor-local weapon object, runner identity, charge/fire clocks, ink cost,
  unrelated gear and permanent loadout are preserved. Another actor is unchanged.

At no equipment, derived Blaster results include roll retention0.96205, surge
scale0.2466182, raw resistance rate11.277 HP/s, cap25.06, jump6.2518246 WU/s and
air spread2.53. These are outputs of existing curves, not fresh physical measurements.
The base resource consumer is not silently replaced by the pending PR315 consumer.

## Pending-patch composition

The exact files of these heads were read and combined locally:

- PR315 `ab951ea408797f54c03c41ff8d5112bd1531217c`
- PR323 `07e6ee0b46be88aa7095fd305f273acb9ba9ca1d`
- PR327 `8a9435a2db5926bf674d87c1a1eee27a8064ecca`

This was a reviewed three-way composition, **not a claim that all Draft branches
merge without conflicts**. Resolution preserves all imports/installer hooks;
combines the reset bookkeeping; retains PR315's weapon-state enemy-speed branch;
uses PR323's `swimSpeedMultiplier` once; keeps the Flow multipliers at identity;
unions independent profile/binding fields and their numeric references. The test
fixture retains both extra exports and built-site resolution. No other PR's
production feature is copied into this standalone branch.

PR315 owns enemy-ink grace, quantization, cap semantics and action classification.
When present, the new effective resistance AP refreshes its existing grace/action
modifiers without restarting its exposure clock. Flow0AP gives33F grace and6 HP/s;
equipment27/57AP plus Flow gives39F grace, with the same6 HP/s quantized consumer.
**Standalone main still needs PR315 for those grace/quantization fixes.**

PR323's Ninja penalty remains exactly0.9 after the AP cap. Its visibility and
Quick Respawn tests remain intact. PR327's grounded bomb/armed-Storm hold speed
stays4.32; Flow does not change special-power cost or the activation snapshot.
The hold-state speed contract uses a fixture state; this is not an additional
claim of the full PR322 holding-state integration or real two-peer acceptance.

Explicit cross-feature tests are in `tests/flow-effects-composition.mjs`, to run
with `node --experimental-vm-modules --test` against that composed source/build.

## Verification

- Dedicated standalone acceptance8/8 on source and emitted/minified public graph.
- Negative original main:3 pass /5 fail, detecting missing effects and saturation.
- Full gameplay/reliability suite750/750, no failures/skips. The first aggregate
  invocation from temporary storage was rejected by two persistent-storage gate
  self-tests; unchanged tests were rerun from a persistent workspace cwd with an
  explicit persistent gate-evidence path. Compatibility/numeric quick checks pass.
- Combined existing/Flow regressions54/54; emitted composed graph11/11, including
  grace, Ninja and Storm/sub cross-feature cases.
- Local quality8/8. Fixed 30/60/120Hz schedules agree on effect expiry/restoration.
- Standalone and composed public builds both succeed. Local GPU/browser acceptance
  is not substituted with Node tests; exact-head Actions remains the browser gate.

#240's Flow-point normalization is outside this change. No activation-point
conversion, new lifetime/death policy, extra ability, or guessed frame value is added.
