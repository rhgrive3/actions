# Range rolling-stripe test contract

CI37294242585 failed `roller court: rolling along the strip lays a stripe on the court floor` at the existing strict horizontal strip boundary. The inspected source is local commit b1f54b4, tree ae7ae06be1cb8f9054de44fe5e1642bd57a89e38, corresponding to published d48b9f43. The unpublished follow-up candidate and its site were not used.

The Range harness loads actual patched Actor/WeaponRunner/Projectiles/Physics and installs the canonical weapons fidelity layer. The test holds Fire from idle, so the first action is a flick, followed by drum rolling. Its paint recorder previously discarded the `kind` field and the assertion treated every delayed projectile/trail impact as a rolled stripe.

A deterministic diagnostic used seeds1–10,13,42,999 in the VM Math stream. Every run generated120 real `kind: roll` samples, all inside the original strict bounds(-23.5,-15.5). Twelve seeds also produced one or two unclassified flick impacts outside those strip bounds. Seed1's failing impact was x=-23.57238709038525, y=.14, z=17.364209406401862 at simulation time.9; its stack is Projectiles._impact→weapon-edgecases→weapons-fidelity. The actor remained at x=-19.5 and advanced to z20.0830222222223.

The only changed production module from the ten-file network repair actually consumed by this Range harness is weapons-fidelity.mjs; the harness does not apply the network adapter. Replacing that module with previous b416b8f and repeating all13 seeds yielded identical counts, actor coordinates and all outlier coordinates. Thus the observed failure is reproducible in the previous production dependency too, rather than introduced by the current network repair. The unseeded original case also passed once, consistent with its random-input sensitivity.

The minimal correction is test-only:
- retain the original five-value `splats` arrays and add a parallel paintEvents record including native options.kind;
- apply the unchanged strict x bounds to actual drum stripes;
- require more than10 rolling samples at more than10 longitudinal positions, preserving nonempty forward progress;
- continue exercising the first flick and leave its canonical projectile geometry tests separately owned;
- exercise a real Actor rolling from outside the allowed strip and require the same boundary assertion to reject it.

Focused positive and displaced-Actor negative:2/2. Complete exact-source Practice Range suite:27/27. No production source, random generator, border, profile, timing, speed or numeric tolerance is changed by the patch. Seed control exists only in the retained diagnostic copy, not the shipped test harness. Real rendering and physical hardware claims are unchanged.
# Range rolling-stripe test contract

CI37294242585 failed `roller court: rolling along the strip lays a stripe on the court floor` at the existing strict horizontal strip boundary. The inspected source is local commit b1f54b4, tree ae7ae06be1cb8f9054de44fe5e1642bd57a89e38, corresponding to published d48b9f43. The unpublished follow-up candidate and its site were not used.

The Range harness loads actual patched Actor/WeaponRunner/Projectiles/Physics and installs the canonical weapons fidelity layer. The test holds Fire from idle, so the first action is a flick, followed by drum rolling. Its paint recorder previously discarded the `kind` field and the assertion treated every delayed projectile/trail impact as a rolled stripe.

A deterministic diagnostic used seeds1–10,13,42,999 in the VM Math stream. Every run generated120 real `kind: roll` samples, all inside the original strict bounds(-23.5,-15.5). Twelve seeds also produced one or two unclassified flick impacts outside those strip bounds. Seed1's failing impact was x=-23.57238709038525, y=.14, z=17.364209406401862 at simulation time.9; its stack is Projectiles._impact→weapon-edgecases→weapons-fidelity. The actor remained at x=-19.5 and advanced to z20.0830222222223.

The only changed production module from the ten-file network repair actually consumed by this Range harness is weapons-fidelity.mjs; the harness does not apply the network adapter. Replacing that module with previous b416b8f and repeating all13 seeds yielded identical counts, actor coordinates and all outlier coordinates. Thus the observed failure is reproducible in the previous production dependency too, rather than introduced by the current network repair. The unseeded original case also passed once, consistent with its random-input sensitivity.

The minimal correction is test-only:
- retain the original five-value `splats` arrays and add a parallel paintEvents record including native options.kind;
- apply the unchanged strict x bounds to actual drum stripes;
- require more than10 rolling samples at more than10 longitudinal positions, preserving nonempty forward progress;
- continue exercising the first flick and leave its canonical projectile geometry tests separately owned;
- exercise a real Actor rolling from outside the allowed strip and require the same boundary assertion to reject it.

Focused positive and displaced-Actor negative:2/2. Complete exact-source Practice Range suite:27/27. No production source, random generator, border, profile, timing, speed or numeric tolerance is changed by the patch. Seed control exists only in the retained diagnostic copy, not the shipped test harness. Real rendering and physical hardware claims are unchanged.

## Reuse for the seven-root batch

Current main b4d5c31 retains the original mixed-paint fixture. Source PR703's validate log111995977888 reproduces the same strip assertion while the UI-only runtime changes do not enter that harness. PR697@a90d94fa separately adopts native paint.kind filtering. The seven-root integration reuses this previously reviewed test-only correction, including its stronger progress and real out-of-strip negative controls. All27 Range tests pass against the seven-root runtime; no rebuild or production change is needed.

The companion validation-job timeout moves10→12minutes, following PR701's existing adjustment after source PR704 run37379233659 was cancelled at the10-minute boundary with gameplay898/898 and network49/49 already successful. Commands, validation thresholds and browser jobs are unchanged. The old run remains historical; the corrected exact head still requires its own CI acceptance.
