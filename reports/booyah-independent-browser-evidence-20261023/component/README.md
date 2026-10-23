# Separate emitted component / WebGL addendum — 2026-10-23

**Completed: the bounded component/WebGL observations below. The normal full-game/browser gate, hardware performance, and Splatoon 3 / retail fidelity remain OPEN.** This is a new explicit small-scene diagnostic, not a full Game run with its rendering suppressed. The original report, failed full-game attempt, aborted initial attempt, captures and uncertain frame batch are unchanged in the parent directory and at commit `b7ea5bad30d75d7178d5033f9c6aad1f25a7dccd`.

## Scope, source and actual browser delivery

Exactly one component case was run for each frozen source: before `42e8ca5689c472d014b51bc0a02a3ba8acf8c361` and fixed `97882010d8c3fa0c48e5a7cd2c852fc82d05374d`. Each case contains one natural lifecycle and one new native deployment followed by early clear. The previous normal minified production builds were reused; no rebuild or runtime edit was made. Source runtime SHA-256 values remain respectively `73b1a5712706f149f5071c196e1d897661e254e2f8877b290988057dc0697cf4` and `95aa1927bc81ec46cae73c5eee63adc3741b1cc760e94bbd9123c65968b9f3dd`. Their full identity receipts remain in [source-build-identity.json](../source-build-identity.json).

Both actual Chromium runs fetched 408 emitted JS modules. Every recorded response was HTTP 200 with a SHA-256 equal to that build's manifest; all 2,110 artifacts per reused build were also read back before execution. Browser version and complete delivered graph are in [before-component.json](before-component.json) and [fixed-component.json](fixed-component.json).

System Chromium uses the same retained arguments: `--no-sandbox --disable-dev-shm-usage --use-angle=swiftshader --enable-unsafe-swiftshader`. The unchanged per-case watchdog is 240,000 ms and the existing navigation timeout is 30,000 ms. No timeout configuration, GPU flag experiment, shader suppression or full-game rendering workaround was introduced. The 320×240 diagnostic viewport is an explicit scene fixture. ANGLE reports SwiftShader; no hardware FPS or real-time rendering rate is claimed.

## Native component path and controlled conditions

The existing `scripts/check-inkwave-crab-browser.mjs` supplied the emitted-component installation pattern. This diagnostic uses the emitted real Actor, existing source Character, Physics, Level, PaintSystem, Projectiles, FX and a real Match instance for the minimal match contract. Native wrappers from the existing installation chain are loaded. The source motion reaches `ready` in both cases. The simple native Level is one flat box floor, with a native 512-pixel paint atlas. There is one actor and no opponents, bots or network session.

The initial conditions compare equal across both receipts: existing canonical `s3-shooter-blaze-01` (Aerospray RG / Booyah Bomb), existing Character with explicit native style `{hair:0,skin:2,outfit:0,eyes:0}`, default gear, camera `[19,18,-24]` looking at `[0,1,3]`, identical hemisphere/directional lights and orange/blue ink colors. Gameplay Math.random begins at seed 7. The production presentation RNG's built-in seed and implementation are unchanged.

The harness supplies fixture intent flags through native `Actor.update`: activate, ordinary native Nice edges once per ten native frames, then native sub press/release when the actual charge becomes ready. The native producer performs charge, release windup, throw, flight, floor collision, world-object creation, source 40F burst and source 80F retirement. There is **no** direct `_startSpecial` / `_blastBurst` invocation, manual frameCount or charge assignment, emitter/producer stub, forced probability, or synthetic emission at 39/79.

Every browser stepping operation performs exactly one 1/30-second rendered frame, with this order:

1. Advance fixture G.time by 1/30.
2. Run native Actor.update(1/60) twice, matching the full game's 30 Hz actor substeps.
3. Run native Projectiles.update(1/30), then native FX.update(1/30).
4. Flush native paint and render the entire diagnostic scene normally.
5. Read back the complete WebGL framebuffer and record its hash, render calls, GL error and context status.

No browser operation batches 18 or more game frames. Nonmutating observers wrap the native spawners and native sprite retirement, passing original arguments/returns through. The raw logs assign external diagnostic IDs to SpecialVfxKit sprite and retained-shape births/retirements; they do not add IDs to application records or author particle state. The exact harness source is retained as the non-executable evidence log [diagnostic-harness.log](diagnostic-harness.log).

## Observed 30 Hz result

Each case completes **301 fully rendered frames**: before in 59.629 s and fixed in 56.656 s, within the existing 240 s budget. These elapsed times are budget evidence only. Both cases have zero GL errors, zero lost contexts, zero director errors and zero page/console errors. All native special-event records and native lifecycle timing match across revisions.

| Observation | Before 42e8 | Fixed 978 |
|---|---:|---:|
| Native deploy callback | rendered frame 78, G.time 2.6 s | same |
| First native 40F burst | rendered frame 98, G.time 3.266666667 s | same |
| Native 80F retirement | rendered frame 118, G.time 3.933333333 s | same |
| Actual suction spawns through 38F | 31 | 30 |
| Actual suction spawns through 40F | 31 | 31; one emitted in this callback |
| Actual scatter spawns through 78F | 32 | 32 |
| Actual scatter spawns through 80F | 32; no terminal spawn | 33; one terminal spawn |
| Bursts in the natural lifecycle | 1 | 1 |
| Object and object-record counts immediately at 80F | 0 / 0 | 0 / 0 |
| Warning/orb retained handles marked dead at 80F | both true | both true |

The natural burst is 40/60 s after the real deploy callback, and retirement is 80/60 s after it. These are native simulation times, not wall-clock FPS or retail measurements.

The fixed terminal scatter is a real puff-pool birth, ID 394, at native frameCount 80 / rendered frame 118: position `[10.0453586578,1.5407001972,-4.8901438713]`, seed `0.7947142720`, stored lifetime `0.6999999881`. The normal scene render and full framebuffer readback complete after this birth. The native object/record is already gone and warning/orb handles are dead in the same readback. That particle later retires exactly once at rendered frame 138, age `0.7000001669`. Before has no scatter birth in its terminal callback. This demonstrates actual final-interval emission before immediate record cleanup, with a normal particle tail rather than delayed world retirement.

Across each complete natural-plus-cancel case, all **608 SpecialVfxKit sprite birth IDs** have exactly one native retirement and all **27 retained shape IDs** retire exactly once. After 65 normal rendered fade frames, sparks, puffs, shapes, object records, round records and the actor track are all empty. Base FX pools are rendered normally but are not individually assigned particle IDs by this observer.

These are actual seeded successful spawns, **not opportunity counts**. No 39/39 opportunity assertion is manufactured: probability and the real first-deployment callback affect actual spawned totals. On the real deploy callback the object exists but native frameCount has not yet been initialized, so the raw observer's nativeFrame is null and nativeObjectBirth omits frameCount; the next callback reads 2. Recipe source uses `o.frameCount || 0`. Treating that first callback as source zero is source interpretation, not a native field readback. The raw null is retained. Before emits one suction there and fixed emits zero; fixed then emits one at 40F. Thus total successful suction spawns happen to match in this seed while their callback placement differs. This does not replace or rerun the prior source/VM opportunity proof.

## Early native cancellation

After the natural lifecycle and fade, the same real producer creates a second Booyah through normal charge/Nice/sub/flight/collision again. At the observed live native frameCount **38**, the harness calls the existing `Projectiles.clear()` path used by range reset. It does not set dead or frameCount itself and does not clear FX to conceal cleanup.

Both native objects become dead with frameCount still **38**, and both producer lists become empty. The next single normally rendered FX frame removes the presentation object record and marks warning/orb handles dead. The cumulative burst count stays **1**, belonging only to the preceding natural lifecycle; it does not increase at clear or during 20 later rendered frames. The later snapshot has zero sparks, puffs, ribbons, shapes, object/round records and actor track. The early-cancel images are pixel-identical. This is early world-object cancellation via a real producer cleanup path, not a full-game death/respawn or UI acceptance case.

## Visual inspection and limits

The recorded setup is identical and the first **77 complete framebuffer hashes** match. The first framebuffer difference is the real deploy callback described above. The small milestone captures were inspected: the burst/dome geometry and phase transitions remain continuous in this scene; no large visual jump or lingering warning/track was observed. RGB pixel comparisons at 320×240 are retained in [comparison.json](comparison.json): 18 changed pixels at native 38F, 18 at 40F, 179 at 78F, 188 at 80F (0.245% of the image), and zero after early cancellation. These support this limited visual observation; they are not a universal acceptance threshold.

Small original captures: [before 40F](before-natural-40.png), [fixed 40F](fixed-natural-40.png), [before 80F](before-natural-80.png), [fixed 80F](fixed-natural-80.png), [before early cancel](before-early-cancel.png), [fixed early cancel](fixed-early-cancel.png). All ten captured 320×240 PNGs are retained; no montage, resized stand-in, reference media, large image package or new runtime is supplied.

This scene intentionally omits the full Game boot/UI/controller, full Match.setup, environment, postprocessor, shadows, original stage load and opponents/network. It uses native rendering of its own explicit component scene; it does not claim the normal app was rendered or suppress full-game rendering to obtain a pass. It establishes the recorded native component emission/cleanup path in actual WebGL. **The existing full-game/browser endpoint and cancellation gate remains open, as do hardware/retail/Splatoon 3 fidelity claims.** The earlier watchdog failure and uncertain batch remain protected and were not retried.

## Retained evidence and repository scope

[before-frames.jsonl](before-frames.jsonl) and [fixed-frames.jsonl](fixed-frames.jsonl) contain every completed rendered frame and each observed target-pool birth/retirement. [comparison.json](comparison.json) retains the actual native event/timing comparison, terminal particle lineage, counter results, pixel metrics and the first-deployment native-field limitation. Both case receipts retain setup, delivered module hashes, original milestones and per-case assertions. Run logs, original small captures and exact diagnostic harness log are included, with byte/SHA-256 inventory in [artifact-sha256.json](artifact-sha256.json).

This addendum only adds files below the existing report's `component/` directory. No old evidence file, failure, uncertain batch, source, runtime, build, main, PR, credential/access setting or other author's work was changed. No native subagents or Work/Discord/support contacts were used. No component browser operation is pending or denied; both bounded cases have a confirmed completed outcome.
