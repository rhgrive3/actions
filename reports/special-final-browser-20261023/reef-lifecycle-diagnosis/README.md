# Reef lifecycle: early-checkpoint probe failure resolved

**The original six-assert failures came from the probe's observation order. No runtime fix is needed.** Both frozen sources pass a corrected fresh-context native reset/reuse/death case. The old probes, logs, images and failure JSON remain unchanged; [145 protected original file hashes](protected-originals-sha256.json) were rechecked after this work. The initial published report remains available at commit `fd5f4b9872a4d3af1dc9c13f810f981e8626d547`.

Candidate `4c9b7861038189e709db5e80e64d2a2712f7b877`, sole-parent control `726e338ac256ba9609086ce65e25a68ddd99df85`. The exact existing normal builds were verified again by inputHash/contentHash and every artifact hash. No source suite, large browser matrix, runtime/main/PR edit, merge, CI dispatch, auth/access change or engine installation was made.

## Cause and native prerequisites

The old sequence was activation at relative1, another48 ticks, fire for relative50, then assert warning at52. Native `all-specials.mjs` requires **38 grounded startup frames, then at least15 dash frames** before accepting a fire edge into `brake`. The VFX director creates the warning when it observes `brake`. This gameplay gate is unchanged between the two pinned sources.

The fresh probe reproduced the old order first. At its original checkpoint, **native tick445 / relative52**, both sources had:

- the same living local Actor in `G.actors`, correct `reefslider` special and real active state;
- successful `_startSpecial` with `stats.specials` incremented once, readiness true before admission and gauge consumed;
- `G.match.playing() === true`, controller enabled, match unpaused;
- the same current VFX director and live Reef track;
- **phase `dash`, dash age about13F, no warning**.

The fire at relative50 occurred at about11 dash frames, before the15F gate. That edge does not queue a future brake. Therefore the warning was not missing because reset/death had incorrectly retired it: it had never been created. The old removal assertions were invalid because their creation prerequisite failed. Changing the actor starting position could not repair that input/checkpoint order.

## Bounded QA-only correction and results

Two fresh contexts were run sequentially in the installed Chromium154.0.8037.57, one per pinned source. The observer waits for the **actual native dash admission state**, sends a new fire edge, and requires an actual `brake` track with a live warning in the real disc pool. It retains that exact current warning before reset or death. No special phase, warning, native clock or retirement flag is assigned by the probe.

| Observation | Candidate | Parent726 |
|---|---|---|
| Reproduced old checkpoint | tick445, dash13F, no warning | same |
| First observed arming | tick449, brake, warning4 live/in pool | same |
| After native reset + one frame | tick450, no track; warning4 dead/out of pool | same |
| Reuse `_startSpecial` admission | native tick454, increment once | same |
| Reuse arming | tick510, new warning6 live/in pool | same |
| After native `splat` + one frame | tick511, no track; warning6 dead/out of pool | same |

Actor1 remained the actual local roster actor throughout; director2 remained current. Reuse used a new track5/warning6, distinct from track3/warning4. Creation, native cancellation/end event and next-frame pool retirement are recorded in order. Neither scenario emitted an impact event. Thus no stale warning reference or fabricated impact was used to pass the case.

**PASS on both sources:** reset, repeated activation, death; page/request/console/GL/director errors0. Each source's118 observed native frames invoked the normal render exactly once, with `_skipRender === false` throughout. The original330+60 initialization warmup was retained unchanged; no new drawing suppression was introduced. No timeout or browser/GPU flag was increased. Every non-boot operation stayed within the existing30-second limit: maximum26,366ms candidate,24,790ms parent. The original180-second boot ceiling was retained.

Receipts: [comparison summary](summary.json), [candidate raw result](candidate/result.json), [parent raw result](parent/result.json), [candidate corrected driver](candidate/diagnose-reef.mjs.txt), [same parent control driver](parent/diagnose-reef-parent.mjs.txt). The drivers are archived verbatim; a rerun should select a new output directory to preserve these outputs.

Original candidate frames, exact native Game FixedClock ticks:

- [Armed before reset,449](candidate/armed-before-reset-tick449.png) → [after reset,450](candidate/after-reset-tick450.png).
- [Armed before death,510](candidate/armed-before-death-tick510.png) → [after death,511](candidate/after-death-tick511.png).

The matching parent frames are retained in the [parent evidence directory](parent/). Characters appear incidentally and were not edited or separately compared.

## What the stall records establish

The existing ordinary **before** records already contain long case wall times and large stored CPU frame-bracket values: Screen44,136.7ms case wall and maximum stored `Game.perf.render` EMA about844.264ms, compared with21,209.7ms and461.410ms on the candidate. Case wall includes simulation, readback, screenshots and CDP; the native `perf.render` bracket includes some work outside the renderer. These are not hardware or displayed FPS measurements.

The exact earlier sustained15/30/60-render-submission exercise was recorded **only on the candidate**. There is no corresponding parent receipt for the49.1763s/89.1195s totals, so identical reproduction of those totals cannot be claimed from the old before data. No new cadence matrix was run.

The focused fresh case nevertheless exposed a matching large JS-frame stall on **both** sources at the same native tick437 / relative44 / dash: **15,584.8ms candidate,15,593.5ms parent**. Median whole-`Game._frame` CPU-wall brackets were14.75ms and13.95ms. This establishes that this observed stall is not unique to the candidate under the minimal case's conditions.

Measurement limits remain: the observer timed whole native `Game._frame` calls and Node/CDP operations, while counting `R.render` calls. It did **not** separately time the inside of `R.render`, isolate renderer-external CPU work, issue GPU timer/fence queries, or measure compositor/display delivery. A driver/GPU wait may be inside a JS bracket. No hardware real-time FPS is inferred. Normal performance acceptance and the absent WebKit/hosted matrix remain separate unresolved limits; the Reef lifecycle assertion blocker is resolved.
