# Crowded character transform work, October 12, 2026

## Scope

Responds to severe bot-crowd slowdown on an iPad mini 6, with the same problem potentially affecting other devices. Based only on main `ed3a046574208471c5db5309e2469d263cacfdfd`. No merge or deployment is implied.

This is a common-path, same-pose optimization, not an iPad-only quality downgrade. Four build-time edits in the native source-motion HumanRetarget replace repeated full-character recursive matrix updates with the descendants of the joint actually edited. Ancestor updates (`true`) remain enabled. The full initial pose and pelvis updates remain unchanged. No clip, sampling rate, solver iteration, tolerance, arm/grip, skinning, mesh, AI, collision, weapon event, shadow, DPR, quality setting or render pass is changed.

For CCD rotation, the edited joint subtree is refreshed. For ankle rotation/translation, the ankle subtree is refreshed. For the analytic leg solve, the upper-leg subtree is refreshed. Read access following each edit concerns that subtree; unchanged siblings were refreshed by the initial full-pose update. The entire root graph, not only the feet, is compared in the regression test.

## Existing device behavior audited

Main already recognizes iPadOS's Macintosh UA with `maxTouchPoints > 1`. Touch high quality already disables GTAO, bloom and MSAA, caps iOS DPR at 1.2 and shadows at 2048, and has dynamic resolution (except ultra). These are existing settings; this patch does not modify them. Lowering resolution cannot remove CPU work in repeated rig traversal.

PR #1298 is a separate unadopted geometry compaction experiment and is not integrated. PR #1301 changes Character/source-controller and presentation motion; it does not edit HumanRetarget or these new adapters. Integration still needs final-composition testing after either PR changes. Unaccepted high-detail weapon models are excluded.

## Local verification

Pure baseline build input identities match all 689 official main inputs; after materializing source text for esbuild's path-sensitive family bundler, the optimized build content hash is exactly `5f967f1dc85094ccbca443250caa97207e81286a86a70a73768087580781ff95`.

Native Character plus actual Player00 and Player01 source banks, 30/60/120 Hz, 576 frame pairs, and 72 explicit foot-clearance CCD corrections: complete node local/world transforms, foot diagnostics and muzzle coordinates compare exactly. The fixture includes a moving/rotating/nonuniformly scaled ancestor, root motion, small form scale, shooter/dualies/roller/charger switches and hero/game/far LOD switches. Transform calls fall from 589,765 to 320,475 (45.66%) in this contact-heavy fixture. This is an operation count, not frame-rate improvement or a general whole-game speedup. The terrain query is a deterministic slope fixture, not the production collision engine.

Local Chromium cannot launch because its singleton socket is forbidden (`EPERM`). This is not a passing browser test. Dedicated GitHub Actions builds the exact main and candidate and runs native source-motion lifecycle and completed-output ABBA, retaining all poses, raw CPU timing, full-frame pixel hashes, screenshots, draw counts and readback timing. Browser evidence remains pending until its artifact is reviewed.

## Browser fixture limits

Eight actual Actors and production source-motion/rendering modules under native day lighting in the same WebGL context. Includes walking, turning, jump/landing, swim return, spawn visual trigger, weapon and LOD changes at 30/60/120 Hz. Deliberate direct visual state inputs isolate the rig; this is not a populated match AI/collision benchmark. CPU updates and render submission/readback are reported separately. Synchronous final framebuffer readPixels is used to establish output completion. SwiftShader wall times are not iPad or hardware GPU FPS. Real iPad mini 6 acceptance remains unmeasured.

The comparison requires identical recorded actor/node/foot/muzzle state, identical final RGBA pixels, identical draws/triangles/quality, fewer matrix updates, no browser errors and all four ABBA runs. Timing variance is retained rather than converted into a guaranteed device speedup.
