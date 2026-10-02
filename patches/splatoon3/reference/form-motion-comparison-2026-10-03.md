# Form motion comparison, 2026-10-03

This independent patch owns kid↔swim-body conversion, the visible emerge/dive gesture, and its weapon transition. It does not own normal swim/wall motion, model topology, gameplay transformation delays, collision, camera, ink recovery or input. Foundation: `5cdc815c923e2e6e0a9860bcfec6a4734a089657`. Production source is `inkwave-public/src/game/character.js`; `game/` is not evidence for this implementation. The configured gameplay reference remains Splatoon 3 **11.3.0**, but the public film below does not disclose its software version. No Switch capture or exact Nintendo joint/scale curve was measured.

## Fresh primary evidence

Nintendo's [Splatoon 3 page](https://www.nintendo.com/jp/switch/av5ja/index.html) describes the two forms, weapon use in human form, and own-ink movement/recovery in swim form. Its [native form demonstration](https://www.nintendo.com/jp/switch/av5ja/assets/images/index/ikatohito/movie/modal_pc.mp4) was fetched anew on 2026-10-03, alongside the current HTML and [research report](https://www.nintendo.com/jp/switch/av5ja/report/index.html). The [weapons page](https://www.nintendo.com/jp/character/splatoon/fashion/index.html) was also fetched anew to check the distinction between shooting stance and form acting. Pages and videos are preserved with URL, resolved URL, retrieval time, byte counts and SHA-256 in `fresh-source-receipts.json`.

Evidence directory: `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-form/`.

| File | SHA-256 | Review |
| --- | --- | --- |
| `official-game.html` | `8f87e8a29d71e43fff7ad41b90563afdc8509bd78c462ee270c430a0e12836ce` | Identifies the demonstration as Splatoon 3 and the purpose of each form |
| `official-form-modal.mp4` | `294c6713400be43793f989f897dfae633bcc2744a369849bd0ec14c77b28e807` | 1100×780, 60000/1001 fps, 12.829483s, moving third-person view |
| `official-form-overview.mp4` | `ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99` | Same demonstration in the page's overview framing; not a second independent gameplay measurement |

`official-form-frame-pts.json` records every decoded timestamp. `primary-frame-observations.json` records the exact selected frames/PTS and conditions. Visually reviewed dense sheets are `official-emerge-dense.png` (frames 260–320 every 2; PTS 4.337667–5.338667) and `official-dive-dense.png` (480–525 every 2; selected endpoint 524, PTS 8.008000–8.742067). Their small tile counter denotes selected order; source index is `start + 2 × counter`. `official-return-dense.png` (531–567) actually shows continuing swim movement, and is explicitly labelled that way in the observation receipt; it does not establish another kid return.

Observed conditions: yellow own ink, shooter visible on the kid, forward ground movement, emergence into shooting and later dive. Gear AP, exact weapon data, controller inputs, software version, and playback editing/speed are undisclosed. The ink column partially hides the body. The silhouette/weapon rises and enters a compact shooting stance; an extended overhead free-arm flourish is not visible in this view. The kid lowers and the gun disappears with it on the dive. These support removing the conspicuous flourish. They do not establish a numerical transition duration, gesture angle, visibility threshold, squash/stretch factor, or frame-accurate gun delay.

## Native divergence and correction

Native `_poseForm` raises the free upper arm toward **−1.75 radians**, spreads it outward, and offsets the weapon anchor by up to **0.04 units / −0.3 radians** over an emerge window ending at **0.42 seconds**. Those are measured source constants, not Nintendo values. The pose is applied after weapon/throw/spawn/special layers. Smoothed aim and two-hand weights alone cannot guarantee that this gesture respects an attack already underway. It also resets hair and injects secondary ear/tank impulses on the emerge threshold. None of that flourish is retained by the replacement form gesture; this patch does not edit the independent native hair system.

The new `_poseForm` uses a compact, leg-relative torso dip/return and leaves arm FK, hand IK targets, weapon anchors, facial channels, hair and other one-shot channels to their existing layers. Main firing/charging/rolling, sub aim and throw, slosh, flick, dodge, spawn, special, Super Jump, air, landing, dance, fidget and death suppress this form acting. Actual Runner state and native Character timers are read without modifying them. Nullable model previews use the same native Character path.

Native `_formEnter` approximates interrupted transitions by skipping into a new timeline. At zero elapsed time, a rapid reverse can replace the displayed scale with a different shape. `_updateFormScales` still calls the native implementation, retains its normal appearance/disappearance and underwater lift, attenuates only its post-exchange wobble, and blends an interrupted conversion from the preceding effective width/height, scalar visibility and lift. Reversal interpolation follows native clock deltas while leaving `formT`, `formPrev`, all native timers and the gameplay form unchanged. Blending effective dimensions avoids multiplying independently interpolated scale factors into an unintended shape. A zero-time reversal preserves displayed scales. Same-body squid/swim/climb changes do not create a kid conversion.

All replacement numbers in `FORM_MOTION_CALIBRATION`—0.10–0.22s wobble recovery, 0.08s reversal blend, 0.16s acting window, torso pitch and leg-relative dip—are **INKWAVE visual calibration**. The original timings and joint paths remain unknown. Retaining the native first silhouette exchange is a scope decision, not a parity finding.

| Motion/condition | Reproduction and implementation | Play effect | Status against original |
| --- | --- | --- | --- |
| Kid→own-ink swim body | Set native Actor form to squid with submerged=true; real `_finishFrame` selects swim; full Character compresses and hides kid/gun | Compact dive; reduced later shape wobble | Visible ordering is grounded in the official clip; all replacement curves are calibrated |
| Own-ink swim→kid | Release to kid, then fire; native weapon pose/IK owns gun transition | Removes prolonged arm flourish and off-angle gun anchor | Official compact emerge/attack observed; exact input, firing tick and joints unknown |
| Rapid reverse mid-conversion | Dive five 60Hz ticks, reverse with dt=0, then resume/toggle at 30/60/120Hz | Prevents a displayed scale jump caused by the approximate native timeline | Defensible engine continuity repair; original rapid-toggle behavior unmeasured |
| Body scale recovery | Sample real posed bones and indexed skin after exchange | Earlier return to ordinary body proportions | Visual calibration; no original numerical settle-time claim |
| Immediate firing/charge/slosh/flick/sub | Enter kid and start native Runner action during conversion | Form layer leaves live attack, bomb and gun channels intact | Action isolation is native-source proof; per-weapon Nintendo joint equivalence unverified |
| Dry, wall and airborne form conversion | Native full rig run for squid/swim/climb targets, grounded and airborne | Preserves native visibility endpoints and gun hierarchy | Official selected clip does not establish these poses; no mapping invented |
| Squid↔swim↔climb without kid conversion | Switch after conversion settles | Ordinary swim/wall pivot remains native | Other lane owns those motions; no added transform pop |
| Reset/spawn/death/weapon switch/hidden preview | Native lifecycle APIs, real Character and skeleton | WeakMap state clears; hidden updates settle; no stale transition after return | Engine cleanup proof; original reset animation not asserted |

## Native output verification

Run `node --experimental-vm-modules --test patches/splatoon3/tests/form-motion.test.mjs`. The test creates **one VM realm**, runs the unchanged production installer once with this module and all fourteen detail installers already present; repeat calls check idempotence. It does not combine the limited walk/roller fixture with another Actor realm. A duplicate installer from a second module realm leaves prototype functions unchanged through `Symbol.for` guards.

The before/after trace is `actual-form-geometry.json`: full pose, actual world bone matrices, body/weapon/squid matrices, native IK errors, measured world-space right-hand grip, representative drawn triangles and hashes of the complete **posed indexed draw** for every visible native mesh. Real `SkinnedMesh.getVertexPosition` and native skeleton/solver run; no dummy bones or AABB-only evidence are used. Topology and source position hashes establish that no art asset was replaced. CPU skinning does not include vertex-shader face/tentacle deformation or establish a GPU-rendered result.

The focused tests exercise scale continuity at dt=0, resumed rapid toggles at 30/60/120Hz, identical complete 60Hz production pose/weapon/vertex traces under 30/60/120Hz render schedules, pause with no simulation tick, all conversion endpoints, action isolation and cleanup. Native floor Physics + Actor.update + Runner are compared with the form layer disabled: position, velocity, input, ink, HP, gameplay form, native timers and scalar runner state must remain identical. No contact/integration method is replaced in that case. The simple action fixture separately isolates scene collisions and explicitly says so.

Native IK slots are `[left arm, right arm, left leg, right leg]`. The primary right-hand grip and actual solver output are checked. The native slosher heave can clamp arm reach, including the weapon arm, while the gun remains attached to the solved hand. The action regression therefore compares actual solver errors, hand bones and gun matrices with a full real-source rig whose owned form gesture alone is absent. This prevents form acting from interfering with attacks without claiming an unrelated upstream heave has zero IK residual. The observed nonzero residual remains an integration finding for the weapon lane.

Build, GPU/browser pose capture, cross-lane integration and exact-SHA CI remain parent-owned. Local source measurements do not substitute for a real Switch comparison.

## Integration and remaining unknowns

Import `installFormMotion` into the shared runtime installer and call `installFormMotion(api, profile)` after the existing Character motion installers. Existing API exports are sufficient; no adapter, profile, art or upstream edit is needed. Flow's final material wrapper can remain last. Lifecycle wrappers delegate native methods and clear only this module's WeakMap state; Actor.reset never changes gameplay behavior. `formMotionSnapshot(character)` is a diagnostic read, and `resetFormMotion(character)` clears only form calibration state. Disposal allocates no extra geometry/material resources. Precise integration instructions are in `integration-handoff.json`.

The parent owns updating `reports/inkwave-splatoon3-behavior-2026-10-02.md` with this scoped record. That shared file is intentionally outside this lane's allowlist.

For exact comparison, capture 11.3.0 Switch output with controller receipts, known weapon/gear AP, fixed camera and dry/own/enemy-ink, moving/stationary, wall/air conditions. Align ZL press/release and first shot with visible kid/gun appearance, ink column, body-height recovery and disappearance. Include rapid reverse inputs at several incomplete stages. Neither public footage nor these CPU tests establish those unknown values. Ink splash topology, shader morphology, physics/hitbox shape and original joint curves remain unmodified/unmeasured.


## Independent integrated review, 2026-10-03

At frozen integrated base `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e`, the install guard was shared across realms but the diagnostic/reset exports still read their own realm-private WeakMap. Reproduce by importing `formMotionSnapshot`/`resetFormMotion` from another module realm while a production Character is mid-dive: the old snapshot returned null and reset left the installed state active. Both exports now delegate to the state owner attached to the real prototype through `Symbol.for`. The regression checks the actual native posed indexed draw and gameplay state are unchanged by diagnostic state reset.

Disposed instances now return before reacquiring form state or applying form channels. Live movement-frame death, special, Roll, Surge and Super Jump ownership also suppress the compact form gesture in nullable previews, while native silhouette exchange remains form-owned. Existing rapid-reversal, dt0, actual Runner attack/IK, visibility endpoints and 30/60/120Hz tests use the integrated installer, not an independently authored partial composition.

Nintendo's retained form movie and sheets were hash-verified and visually inspected again after a current primary-page/media lookup. Conditions and unpublished curves remain as recorded above. Review receipts and hashes are in `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-squid/`. The shared legacy movement module's cross-realm installation/state defect is an explicit parent handoff; GPU/Actions and the aggregate comparison report remain parent-owned.
