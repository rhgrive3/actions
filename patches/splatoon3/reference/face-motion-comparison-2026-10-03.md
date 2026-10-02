# Face motion comparison — 2026-10-03

The independent patch corrects the public INKWAVE rig's action gaze. It leaves native head/body poses, IK, blink clocks and facial expression curves in their existing owners. This is an INKWAVE output correction motivated by official weapon demonstrations, **not a measured reproduction of Nintendo's private eye animation**.

## Primary sources and observation limits

Freshly retrieved on 2026-10-03:

- [Nintendo: Splatoon Base weapons and gear](https://www.nintendo.com/jp/character/splatoon/fashion/index.html): page bytes saved as `nintendo-fashion-20261003.html`; shooter and charger public media IDs still present. Fresh embed requests for `y7Zl26Zl12n` and `1O2DPpbDvdL` returned HTTP 403. No bypass was attempted.
- [Nintendo: Splatoon 3 weapons and gear](https://www.nintendo.com/jp/switch/av5ja/customize/index.html): confirms main/sub weapon context, without describing numerical eye or blink behavior.
- [Nintendo: Turf War](https://www.nintendo.com/jp/switch/av5ja/battle-nawabari/index.html) and its [official emote movie](https://www.nintendo.com/jp/switch/av5ja/assets/images/battle-nawabari/movie/emote_pc.mp4): freshly downloaded 1280×720, 60000/1001-fps footage, SHA-256 `c4bd204d58a4cdce0e4934fdd2774d0eaf93b3506c511f81f8929c4fb527a799`. Frames 0/30/60/90/120/180/240/300, PTS 0/0.5005/1.001/1.5015/2.002/3.003/4.004/5.005 seconds. Face orientation and facial appearance vary with the selected emote. These are selectable previews; they do not establish a universal victory expression.
- [Nintendo: Squid Research Lab reports](https://www.nintendo.com/jp/switch/av5ja/report/index.html): freshly retrieved contextual primary source; does not publish facial animation curves.

Existing official shooter/charger clip bytes were independently rehashed before reuse. Shooter `official-shooter-1-1080.ts`: SHA-256 `6fd20313b229072b55aca46805afc943cc22c3358620b37ed7dceee674ee76b7`; charger `weapons/charger-1.ts`: `f28d5fb12f11964a687dffd4284c0d9b183f52f4bb3456703e20fc2ea549e47f`. Decoded shooter frames 18/30/42/60/100/200 and charger frames 222/230/238/246/254/270 have their original PTS in `official-frame-receipts.json`. The rear camera shows weapon/aim action but obscures detailed pupil direction, mouth movement and blink timing. This footage is **not** original eye-axis proof.

The patch profile targets 11.3.0. None of these movies displays its executable version. Exact shooter/charger model names, gear abilities, controller input edges and motion controls are unverified; the official media labels identify the weapon classes. No Nintendo world scale, eye angle, blink rate, eyelid curve or expression amplitude is inferred as an exact original value.

All evidence below is under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-face/`. Source bytes, URLs, hashes and retrieval failures are recorded in `source-receipts.json`; original frame PTS/crops in `official-frame-receipts.json` and `official-emote-frames.json`. Visual records: `shooter-face-sheet.png`, `charger-face-sheet.png`, `official-emote-face-sheet.png`.

## Behavior differences and implementation decisions

| Motion/state | Official evidence / limit | Public INKWAVE implementation and reproduction | Impact and patch status |
| --- | --- | --- | --- |
| Firing gaze | Official shooter demonstration shows directed weapon use; fine iris tracking is occluded. | `character.js:_poseLook` sets aim yaw to zero relative to body, uses `aimP * .85` and an artificial 8-m attention point. `_gazeTick` adds random fixation motion. Give a live Actor a body/aim yaw gap, fire, then change its actual `aimPoint`. | Actual iris axes can point away from gameplay aim. **Corrected in engine**, original numerical parity unknown. `_applyFace` completes natively, then only eye gaze uniforms are corrected to the actual target. |
| Charging gaze | Charger demonstration is rear-facing; exact eye trajectory cannot be measured. | Same attention problem while actual `WeaponRunner.charge` is nonzero. | **Corrected in engine** through the same eye-only path; preserves native charge effort, mouth and brow output. |
| Sub aim / throw gaze | Primary pages establish sub use. Original fine facial timing is unverified. | Native `_poseLook` does not use the bomb's actual aim point. Hold sub aim, then release through the real Runner. | **Corrected in engine** while sub aiming and during the native throw timer's recovery. The .4-s recovery gate is INKWAVE visual calibration, not an original measurement. |
| Eyelid / blink / wink | Official emote preview exposes face appearance changes, but selected frame samples do not establish a blink curve or rate. | `_blinkTick`, `_blinkStart`, `_applyFace`, `character-mats.js:iwBoneClose/iwLidClose` and the native indexed skin's `aFace` attributes. Trigger a hard blink and a wink. | **Preserved and verified on native output.** Eye-bone scaling drives sliding lids; it does not flatten the head-skinned eyeball caps. No invented blink-rate correction. |
| Firing / charge expression | Shooter/charger rear footage cannot establish exact mouth/brow curves. | `_poseFace` uses `X_GRIN`, `X_FOCUS`, `X_EFFORT`; native mouth uniforms, jaw and brows still execute. | **Preserved**, exact original expression mapping remains unknown. No universal grin/effort preset is claimed as original. |
| Landing / damage expression | No readable, controlled front-facing sample in the selected official material. | `trigger('land'/'hit')`, native hard blink/wince/micro-expression paths. | **Preserved and regression-checked**, original timing and intensity unknown. Native damage gaze owns its .7-s reaction window; that gate follows INKWAVE's existing face hit window and is visual calibration. |
| Victory expression | Fresh official emote preview shows different selectable poses/facial appearances; menu preview is not an actual match win. | `setDance('victory')` and native expression lanes. | **Preserved**, no overwrite during dances. One generic original victory face is not invented. Body/emote corrections belong to their separate lane. |
| Interruption | Exact original reaction/reset curves unmeasured. | Real Actor/Runner reset, splat/death, weapon switch, form change, charge/sub release, hidden/far state and disposal. | Face state is cleared or gated; no old action gaze survives its owner. No gameplay timers, physics, resources, inputs, aim point or native RNG are changed. |

## Native geometry correction

The final native eye shader applies a `.6` gain after combining `uLook * 1.25 + uGaze`, adds `EYEB.rest`, mirrors the right socket, and clamps yaw/pitch. The old `_applyFace` comment's “90%” target tracking is therefore not the actual drawn output; outward socket frames and ellipsoid radii also matter.

The patch imports the **unchanged actual** `EYE_FRAMES`/`EYEB` from `src/game/character-face.js`. It transforms the world aim point through the currently posed head, restores bind space, inverts each ellipsoidal eye map and compensates the native shader gain/rest once. Native shader bounds remain authoritative. Extreme aims are reported as clamped, never as exact alignment. Too-near, unset or backward points fall back to the actual aim direction, following the native projectile's rejection rule. Character-only previews use their actual pitch input and root facing. Invalid aim vectors fall back to the entire native face output.

There is no face topology, mesh, hair, material shader or animation art edit. Native attention/head springs and native gaze RNG/clocks still run unchanged. Only the final `uGaze` and face gaze diagnostic values are overwritten for eligible actions.

## Verification and handoff

Focused command: `node --experimental-vm-modules --test patches/splatoon3/tests/face-motion.test.mjs`.

The test loads the actual production installer once in one VM realm, composes the new face installer after existing hooks, and uses actual Actor, Character, Runner, drawn indexed eye/skin geometry, native skinning and native IK. A duplicate module in a second VM realm cannot install another hook because the guard uses `Symbol.for` on the actual prototype.

`native-face-trace.json` captures before/after output for firing, charging and sub aiming: all indexed cap vertices, actual cornea/iris axes, complete body pose/bones, weapon/muzzle transforms, native IK, and gameplay state. The unconstrained actual INKWAVE iris-axis angle to the gameplay target drops from a nonzero angle to floating-point zero. This is **native CPU geometry proof**, not a Nintendo measurement or GPU/browser proof. Blink geometry has a separate `native-face-trace-blink.json` when the trace environment variable is supplied. Tests also cover nullable preview, pause/dt=0, 30/60/120-Hz rendering through the production FixedClock, real throw release/expiry, damage, landing, victory, reset, death, weapon/form interruption, invalid aim, shader clamping and disposal.

Parent integration: import `installFaceMotion` into the shared installer and call `installFaceMotion(api, profile)` **after the body/action/idle/emote hooks**. No additional native channel exports or gameplay hooks are required. `faceMotionSnapshot(character)` is available for browser evidence; `s3FaceMotionEnabled = false` retains the complete native face baseline. The parent owns the aggregate `reports/inkwave-splatoon3-behavior-2026-10-02.md` update, build/browser verification and exact-SHA CI. This scoped patch does not claim those have passed.
