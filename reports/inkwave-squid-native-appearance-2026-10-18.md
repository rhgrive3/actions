# Squid appearance: bounded source/native comparison

User request: improve the cheap-looking squid and uncomfortable movement, comparing with Splatoon3. Squid only; human geometry/hair remain outside scope. No exact reproduction claim.

## Source and evidence

Baseline main da97926a21e0e7c6170d76864f896123d979f915. Runtime source-of-truth is the upstream snapshot plus production `adaptBuildSource` adapters. `patches/local-quality/s3-squid-look-adapter.mjs` already bundles the arms, moves the two long feelers to arm indices0/9, enlarges the eyes, and rotates the squid face half a turn. Looking only at unadapted `character-geo.js` would misdiagnose the current shape.

Official publicly viewable Nintendo gameplay: https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 . SHA256 ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99. At approximately3.1seconds a jumping yellow squid shows the broad mantle, large white eyes, bundled short arms and two much thicker elongated clubs. This is gameplay evidence, not a recovered model or measured original dimensions. Software version, gear and exact input are unknown. Side/rear surface details obscured in this clip remain uncertain. No source model or texture was extracted.

## Composed baseline geometry measurements

Hero24251 triangles; game9172; far3136. Three opaque batches (body, black eye band, eyes), plus a separate conditional submerged ghost. Hero bounds approximately width0.40747m, height0.63116m, depth0.22531m. The mesh already has modelled suckers and fine subdivision; extra geometry is not automatically an improvement. Measurements come from the actual fully composed `getKidShared(lod).squid` via the production-source loader, not a proxy mesh.

## Attribution before changing shape

The motion owner reproduced integration defects in the actual source-bank path: procedural wiggle being added after source deformation, long feelers assigned to short-leg chains, and source body/eye orientation inconsistency. A further LOD transition binding defect was reported by that owner and belongs to their regression tests. Correct those before attributing deformed silhouette or eye separation to the rest geometry. The first native comparison deliberately keeps geometry/material bytes unchanged.

## Native QA contract

`tools/squid-production-qa` is a bounded extension of the existing manifest-verified emitted browser runner. Baseline and candidate use identical scripts, actual emitted Character/Actor/materials/source banks, production day Environment and exposure0.94. Each emits80 PNGs:4 isolated rest-surface views; source/fallback7state×4views; source/fallback10temporal samples for90-degree turning and emergence. Actor is local. Source assets must reach ready before settling. Receipts include authored source hashes, emitted artifact hashes, loaded URLs, screenshot hashes, source clip/frame, deformation uniforms and transform state.

Temporal samples are driven Actor presentation tests, not full-match physics measurements or original-game frame parity. The isolated rest views contain actual squid geometry/materials with zero animation; they are explicitly separate from the source-loaded motion sequence. Shader/compiler errors fail the suite. Local Chromium was unavailable due sandbox socket denial and a failed mount in the permitted escalation attempt; no local browser success is claimed. Actual CI results and visual acceptance must be attached before approval.

## Current status

No speculative geometry/material revision selected before native diagnosis. Preserve the original files. The first candidate is an evidence-based binding/motion repair; determine remaining shape/coating differences only from the resulting front/oblique/side/back images. Keep original-game visual equivalence unconfirmed.

## Regression candidate verification before native capture

Motion-binding candidate adds a fail-closed source adapter, preserves the public upstream snapshot, and leaves all body/eye geometry and materials unchanged. Four repairs: common authored orientation for source skeleton/body/eyes; long chains map to the existing long feelers0/9; source skeleton owns deformation without extra shader wave; LOD swaps rebind native placeholder skin attributes to source bones. Reusable scratch vectors remove per-frame allocations without changing trajectories.

New actual source-bank tests pass2/2 over2625frames and3LODs×30/60/120Hz. Related existing motion suites pass16/16. The recovered local repository initially failed its existing index.html compatibility check; restoring the exact baseline HTML fixed compatibility without weakening the guard. Local esbuild is unavailable, so no local emitted-build pass is claimed. The existing source motion bank is Wii U-derived; successful retarget integration is not proof of Splatoon3 animation equivalence. Clean official Git checkout production build, emitted test and before/after browser evidence are required by the new workflow. Native visual acceptance remains pending.
