# INKWAVE pinned special candidate: real-browser evidence

Latest PR head: **`2e8d90b8afb6aac057edfbb988fae789ef36cfd3`**. [Explicit unchanged-input binding, new-head CI checkpoint and bounded common-stall diagnosis](head-2e8-binding/README.md). The4c9 capture identities below are preserved as actual capture provenance.

**Verdict: partial Chromium visual acceptance only. Final visual acceptance is not justified yet.** The observed special changes render and their normal native paths pass. The initially failed Reef repeated-lifecycle assertions are now explained and corrected: a bounded fresh-context native probe passes reset/reuse/death on both candidate and parent. Normal real-time performance is not established in this software-rendered cloud environment. See the [Reef diagnosis and QA-only correction](reef-lifecycle-diagnosis/README.md). WebKit is absent. This is browser evidence, independent of the parent's native tests and mandatory exact-head CI.

## Source and fresh normal build

Repository: `rhgrive3/actions`.

| Identity | Candidate | Before |
|---|---|---|
| Commit | `4c9b7861038189e709db5e80e64d2a2712f7b877` | `726e338ac256ba9609086ce65e25a68ddd99df85` |
| Tree | `8dc50f1832b8f54d06ccee88c827f1b2fc9a4aff` | `cfd4402fa796d11daffe2db0d34cdfcac8a4c71c` |
| inputHash | `3fbcdb527d87ae0318e1e1df3037088e8d82ae8f979d6d7cae00b9a353ce4f91` | `350b861c6d2ca16e5430ffc5b4f7e39cfbefc9df67290de1746b077ae256eb81` |
| contentHash | `bd3d8d2715b53a842901be6457bdb777621c4290f60a2c37a1404e4f9e5d3707` | `caa80f320098ca6b8d4cbedd4b8f6ca2b8652663cfb120412abf8dfb78f4d100` |
| Build revision | `a73fa9410e41bf635a38b36165e333965ae4d0f606b0b28f6fd9965e37fdd4f9` | `d0aad52ff86d0915c282be5ff1cc481fa63f7511ed765743c9d9e62f73e59f9d` |
| Inputs / manifest artifacts | 1421 / 2112 | 1420 / 2110 |

The candidate has exactly the supplied sole parent. GitHub officially resolved the immutable candidate; local fetched Git objects confirmed its tree and parent. Each side was freshly built with its own registered `node scripts/build-inkwave.mjs inkwave-public <separate-output>` invocation. Node `v24.19.0`, esbuild `0.28.2`; normal minification/composition, no diagnostic build. Every manifest input was checked against its checkout bytes and the pinned Git blob; every output artifact was physically read and hashed. The candidate has **2113 physical output files**, including `inkwave-build.json`, which is excluded from the 2112-entry artifact map. Its contentHash matches the previously reported native build, but this is a fresh build and new browser work.

Only four production runtime leaves differ: `special-vfx.mjs`, `special-presentation.mjs`, `special-motion.mjs`, and new `area-special-vfx-clock.mjs`. Existing main optimizations are retained. `AGENTS.md` was read; `/workspace/.agents` contains no installed skills. No moving main or obsolete branch was used. No source suites were repeated.

Full identities and original manifests: [build identities](build-identities.json), [candidate manifest](original-after-inkwave-build.json), [before manifest](original-before-inkwave-build.json), [QA source/tool identity](source-qa-identity.json).

## Method and actual coverage

System `/usr/bin/chromium`, **154.0.8037.57**, Playwright `1.62.1`. Existing registered browser flags were retained. No engines were installed or impersonated. Bundled Chromium is absent at `/home/agent/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`; actual system Chromium was selected. WebKit is absent at `/home/agent/.cache/ms-playwright/webkit-2336/pw_run.sh`.

The ordinary sweep loaded the real built index/bootstrap and native tidewater/day match. The same seed `0x1a2b3c4`, input schedule, low-quality settings, viewport `960x640`, lighting and native follow camera were used on both sides. Bots were frozen through the existing debug hook. Persisted production catalogue selection equipped each special. Native `Game._frame(1/60)` advanced the frozen game; phases were never assigned manually. Both sides completed ten cases. An independent check confirmed matching setup ticks, palette, positions and native phases at every paired sample: [comparison checks](comparison-checks.json).

| Check | Actual result | Evidence and limits |
|---|---|---|
| Vac accepted release and muzzle | **PASS** | In the release probe, candidate had no muzzle before native tick1344; exactly one projectile and one muzzle occurred at1344, activation-relative381. Cosmetic origin equalled the still-visible held nozzle exactly; native projectile origin stayed separate. Parent flashed at1324, before its accepted projectile at1344. Continued stepping produced no extra muzzle. Holding through exhale produced no candidate flash. |
| Trizooka three birth pulses | **PASS** | Candidate indices0/1/2 notified at native ticks448/451/455, with exactly three 3/60-second glow pulses. Later pulses resampled the moving cosmetic nozzle. The heavy muzzle spray remained once per action. The parent's pulse list is empty. No manually created births were used. |
| Stamp airborne contact anticipation | **PASS** | Native jumpSwing at relative46; actor airborne at relative43. Holder X rotation changed from1.53 to1.84875 before contact; both were4.08 at relative47. Native positions and contact events matched. |
| Chump upward jet | **PASS** | Native deployment relative53; observed muzzle direction changed from aim vector `[0,0.0998334,0.9950042]` to `[0,1,0]`. Paired ordinary frame relative54 shows the upward jet. |
| Bubbler ignition gate | **PASS, emitted browser diagnostic** | Separate native Actor/Projectiles/FX flat-floor A/B: steps1–14 had `ignited=false`; candidate pillar/halo alpha remained0, whereas parent alpha was nonzero. At step15 ignition became true and candidate beam appeared. These are explicit Actor steps, not Game FixedClock labels or retail frame measurements. |
| Kraken strands | **PASS, local observation** | Ordinary native jump at relative75 produced8 jump strands at77/90; they retired before charge/dash. Native dash had22 strands at160/180. Remote Kraken jump-spin was not tested. |
| Screen upright fade | **PASS** | Ordinary native deployment/landing/expiry were observed. At relative760, candidate sheet Y scale1 / opacity0.4359546; parent Y scale0.51 / opacity0.8548129. Close paired images used a controlled actor-position adjustment at relative640, followed by the unchanged native follow camera; both actors remained alive and camera/positions matched. These close frames are inspection evidence, not a continuous walking path. |
| Inkjet pack ownership/lifecycle | **PASS** | Registered `check-inkwave-inkjet-presentation-browser.mjs` passed actual emitted Actor/Character/Physics/FX at30/60/120 updates: moving nozzle errors about0.00496 units, shot, pause, squid suppression, native return/landing, reuse, reset and death. Ordinary full-game frame retained separately. Update rates are not measured display FPS. |
| Reef normal impact warning retirement | **PASS** | Ordinary native brake relative60, impact/recovery98. Warning live at80; candidate warning dead at100, while parent's remained live. The retained blast still occurred once at native impact. |
| Reef repeated reset/death/reuse warning checks | **Original invalid FAIL; corrected PASS** | Both original six-assert failure records remain intact. Fresh diagnosis reproduced their relative52 checkpoint as native dash13F, before arming; their fire at50 was before the native15F dash cancellation gate. A state-gated observation then confirmed real arming and current warning identity before reset/reuse/death on both candidate and parent, all observed frames rendered. [Full diagnosis](reef-lifecycle-diagnosis/README.md). No runtime change was needed. |
| Splash accepted impacts and cancellation | **PASS** | Ordinary impacts/body+two fists at relative70/87/87 yielded exactly three candidate blasts at those ticks/positions. Reset+clear yielded0; reuse yielded3; owner death yielded only the two independent fist impacts. |
| Remote Splash presentation | **PASS, accepted-replay fixture** | Actual emitted replay entry and cosmetic route: destruction/visual expiry yielded0 landing blasts; one accepted impact replay yielded1. This is not a real-peer transport or packet-duplication test. |
| Loadout continuation after geometry/PNG | **PASS** | Candidate registered continuation helper and animation gates ran in actual Chromium phone portrait390x844 and desktop1440x900. Geometry and screenshot completed; Back started0, stale result callback rejected, locker roundtrip passed, Continue started exactly1 with changed weapon. No page/HTTP errors in clean run. Full hosted responsive matrix remains CI work. |

Ordinary and supplementary native-game runs had **zero page errors, console errors, request failures, sampled WebGL errors/context loss, and VFX director errors** on both sides. The browser warned that `KHR_parallel_shader_compile` was unsupported. The flat-floor ignition diagnostic also had no page/GL/director errors.

Raw observations: [ordinary before](ordinary-before.json), [ordinary after](ordinary-after.json), [release/lobes before](release-lobes-before.json), [release/lobes after](release-lobes-after.json), [shape before](shapes-before.json), [shape after](shapes-after.json), [Bubbler before](bubbler-ignition-before.json), [Bubbler after](bubbler-ignition-after.json), [registered Inkjet](registered-inkjet.json), [continuation](continuation.json), [lifecycle](lifecycle-after.json), [Reef repeated placement probe](reef-placement-repeat-after.json).

## Clocks, resources and remaining blockers

Screenshot filenames and [image index](images.json) contain exact **native Game FixedClock ticks** and activation-relative ticks. Event instrumentation accounts for `s3Clock.advancing`: an event inside a fixed tick is labelled by that completing tick. Bubbler diagnostic filenames explicitly say `actorstep` instead.

The game simulation ran at fixed1/60 steps. Presentation callbacks ran with the requested deltas; most ordinary captures skipped GPU drawing between selected endpoints. These are deterministic observations, **not a claim of60 wall-clock FPS**. A separate render-submission exercise used15/30/60 native render calls with requested deltas1/30,1/60,1/120; each advanced exactly30 native ticks /0.5 simulation seconds. Measured wall submission times were0.2124s /49.1763s /89.1195s. GPU queuing and competing software-rendered contexts make the first number especially unsuitable as display FPS. Severe stalls mean **normal real-time performance is not accepted by this run**. No timeout or GPU/browser flag was increased to hide this.

Finite resource observations ended at zero tracked special objects/fists/tracks, with late geometry/texture counts stable across the final two observed cycles (289/33 in the placement repeat). These counts do not repair the failed Reef warning preconditions and are not a long-duration leak or real-device benchmark.

**NOT RUN:** WebKit; full hosted responsive Chromium/WebKit matrix; real-peer remote transport/duplication; physical-device/display performance; prolonged multi-special resource stress; Nintendo retail capture/timing comparison. The parent's24 native tests and mandatory exact-head CI are not counted as browser acceptance. Experimental TWISTER/radial Splash, Cooler deployment, Storm physics/network, and future Wail/Zip/Booyah work remain outside this candidate and this verdict.

Initial invalid attempts are preserved: direct field-only selection that did not activate Vac, held-through-exhale probes without release, fixture favicon404, and a remote fixture missing the exported `Hit` constructor. Clean continuation and corrected remote runs are separate. The two original Reef probe failure records remain visible; their early-checkpoint cause and the corrected passing browser evidence are recorded in the follow-up. No runtime, PR or main edit, merge, CI dispatch, authentication/access change, Nintendo-media fetch, Work or Discord operation was made.

## Representative original frames

The initial16 packaged PNGs are original own-game or explicitly labelled flat-floor diagnostic bytes. The follow-up adds8 original Reef frames from the two fresh contexts. No character model was edited or separately compared. [Image index](images.json) gives exact ticks, camera scope, source paths and SHA-256 hashes. All original before/after outputs remain under the saved workspace's `.ci-scratch/special-final-browser/`; packaging copied selected files and did not overwrite originals.

Representative matched pairs:

- Vac accepted release, native tick1344: [before](images/before-inkVac-tick1344-rel381.png), [candidate](images/after-inkVac-tick1344-rel381.png).
- Trizooka third pulse observation, native tick456: [before](images/before-trizooka-tick456-rel63.png), [candidate](images/after-trizooka-tick456-rel63.png).
- Stamp pre-contact, native tick1826: [before](images/before-ultraStamp-tick1826-rel43.png), [candidate](images/after-ultraStamp-tick1826-rel43.png).
- Chump upward deployment, native tick447: [before](images/before-superChump-tick447-rel54.png), [candidate](images/after-superChump-tick447-rel54.png).
- Screen close inspection, native tick2763: [before](images/before-splattercolorScreen-tick2763-rel760.png), [candidate](images/after-splattercolorScreen-tick2763-rel760.png).

This report-only branch was checked absent, created from the pinned candidate, and officially read back before evidence was added. It grants no release or merge acceptance.
