# Roller support fixture completion, 2026-10-19

Fixed source: integration `67db773cf2d2ef49bea7a6187cc412c3c5590ef9`. This changes one CPU test and this record. Game runtime and model files are unchanged.

## Reproduced failures and repair

The original test passed 5/7. Its flat-paint assertion and the historical single-module residual-paint assertion failed. The fixture hand-composed six adapters, invoked only WeaponRunner.update, and set grounded without querying Physics. Current physical roller paint is queued by the runner and committed by Actor._finishFrame; rollingPaint also requires the actual ground.hit receipt.

The fixture now uses canonical adaptBuildSource and performs the real Physics.groundProbe followed by Actor._finishFrame after each controlled runner step. Pinned movement and the six normal cases are retained. Their test bodies differ only by these completion calls; all 33 normal assertions, including positive flat paint, owner damage, remote suppression, velocity, ink and ledge/airborne checks, are unchanged.

## Honest negative control

The b34 roller file stays byte-for-byte frozen at SHA256 `52e587f60d6211054c2bad04f746471e85ebdb0295e051f797b41a0019847eb7` and has its own identity check. Replaying that one old module no longer proves historical whole-main behavior: current roller-contact-paint separately rejects zero stick. The original failing execution is preserved as diagnostic evidence.

The replacement negative is explicitly counterfactual current source: it changes only rollerStickActive admission, the drum-support decision to feet-only, and the independent physical-paint zero-stick guard in its isolated VM. Both owner files have exact SHA256 pins and every mutation anchor must occur exactly once. The positive residual-paint assertion remains, now against the correctly labelled counterfactual. No production file is altered or broadly disabled.

## Results

- Final combined source run: 24/24 (13 spawn-barrier + 3 projected-area + 8 roller cases), zero actual-read Git-blob mismatches.
- Each of the three counterfactual faults is necessary: retaining it independently fails the matching damage, paint, or ledge assertion.
- Missing/duplicate mutation anchors and wrong input hashes reject.
- Omitting either the real ground query or frame completion reproduces the positive flat-paint failure.
- Existing Node source-fixture warnings for optional dynamic motion import remain; optional motion loading and GPU rendering are not claimed.

Run on a checkout with Node VM modules: `node --experimental-vm-modules --test patches/reliability/tests/special-spawn-barrier.test.mjs patches/splatoon3/tests/turf-projected-area.test.mjs patches/splatoon3/tests/issue-847-roller-drum-support.test.mjs`. These files remain in existing test discovery. This is source/CPU acceptance; emitted and browser runs remain CI gates.
