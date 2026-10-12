# Native ray full-game diagnostic, 2026-10-12

Run: https://github.com/rhgrive3/actions/actions/runs/38284051070
Diagnostic head: 19e9de3df5b8302059222abd354242f158eade24
Baseline: ac1159b76b42a10ff02fe58add74a8285cc08d32
Candidate: 555929715ba914fa6a78533e32ed492e1f03b564 (PR 1316)
Artifact 11764821065, ZIP SHA256 9933a19b369950e7059191b9f5b683f9fc496f33cbdf6b3f02d81bd763fa76ae, downloaded and verified.

## Result
All four ABBA runs completed; exact-state gate failed. Every measured window had 8 live actors, with exact actor position/HP/ink across variants. A0/B1/B2 have identical paint grids at all four windows. A3 (same baseline as A0) has a different grid from its first window and stays unchanged, despite identical ink consumption. Draw triangles also differ slightly A0/B1. No performance acceptance or candidate regression conclusion follows.

The rendered overview successfully shows eight grouped actors. The actual renderer, Character, bot brains, gameplay, resources, collision, and paint remain active. Scene input forces outward fire after actual bot decisions. No invulnerability is added.

## Software GPU bottleneck
The same-task synchronous readPixels after each 30-frame window waits 38.97–40.34 seconds. This explains much of the 26-minute batch independently of the small JS frame times. These are Chromium SwiftShader completion waits, not iPad GPU measurements. Frame timings include GL submission and backpressure. gl.finish alone is not used as proof of GPU completion.

Frame means A0/B1/B2/A3: 13.571/15.688/17.528/17.875 ms. Medians: 12.5/12.7/14.3/14.7 ms. These are raw incomplete evidence, not an improvement rate.

## Separate 60-frame sampling profiles
Both profiles preserved; sampled duration baseline 1356.233 ms, candidate 1465.503 ms. Single sampling windows cannot establish a performance improvement.

Baseline/candidate inclusive milliseconds: renderer 339.135/404.459; Character 243.154/255.534; retarget 141.991/112.620; paint union 82.452/75.829; bot 14.121/10.879; base physics module (including calls delegated to native collision) 21.162/11.725. Inclusive categories overlap.

Native ray self: 95.087/82.927 ms. Callers: FX drops 52.863/58.371; Character ground 23.205/15.989; Physics groundProbe 17.951/6.427; bot groundHeight 1.068/1.076. queryBox self/inclusive 1.082/1.062 ms; no capsule-distance sample. The vertical ground-ray path is present in actual gameplay, but this is not a validated whole-game speed comparison.

Retarget updateWorldMatrix self 60.470/65.726 ms; relevant to PR 1306. Whole renderer cost cannot be assigned to weapon meshes. (program) 435.573/443.099 ms cannot be attributed to GPU or shaders. No shader compile/link sample was observed; that does not mean shader execution is free.

## Next diagnostic
Do not repeat the long ABBA blindly. Instrument initialization RNG call counts/state, Match.setup boundaries, completed source-motion/warm promises, real clock/paint records, weapon and bot setup. A seed reset before async startMatch does not guarantee no interleaved RNG consumers during fades/loading. The current evidence lacks pre-window detailed snapshots, so the first divergence cannot be located post hoc.
