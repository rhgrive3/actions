# INKWAVE batch C23

Initial main baseline: `f31f5da439134fe49bb89018dad5557671a49c67`.
Integration dependency: Ready PR #822 (`inkwave/batch-c-22-consolidated`). The dependency's 22 Issues are not counted again here. This batch adds #506, #798 and #810. It changes installed INKWAVE adapters, runtime, tests and reports; the locked `inkwave-public/` tree is unchanged.

- #506: snapshot raw Charger charge time into the active finite-flight damage job; preserve the existing nonlinear range/speed/paint input and owner-only damage. The 8F/9F/30F/full60F native hit regressions include a negative control using the previous active-flight interpolation. Full damage remains the pinned 160. Community slope and rounding limitations are explicit in the behavior report.
- #798: schedule the native bomb trajectory preview on a local 30 Hz presentation cadence during continuous walking/aiming. Keep discontinuity, lifecycle, actor and physics invalidation plus live color/ring updates. The helper lives in the already installed weapon module, retaining the 131-module core budget. Actual bomb movement, fuse, damage and paint are unchanged. Query counts are logic measurements, not mobile frame-time or Nintendo cadence claims.
- #810: refresh an existing held Charger keep on the squid-to-humanoid edge. Preserve expiry and physical trigger-release cancellation, composed fresh-start state and refill gates. The separate #359 initial-store eligibility issue is not claimed.

Combined local checks: 53 focused native tests passed, zero failures. Production build passed; startup budget passed with 131 core and 14 Practice Range modules. Canonical numeric status regenerated and quick patch checks passed. Full automated tests and the browser/network/Practice Range/startup/render catalog gates run on GitHub Actions at the final pushed source and native merge candidate; pending results are not acceptance evidence.

The current Open/Draft PR actual-diff audit covers all 28 open PRs and all three current Issue timelines/comments/assignees. PR #821 changes the separate Charger 16F post-shot writer, PR #758 changes the separate Charger surface/swim and paint path, and PR #818 changes Roller/reticle composition; none implements these three roots. The shared claims remain owner C and public担当 comments precede edits. The parent repeats the changed-head audit immediately before publication.

No merge is authorized or performed. Switch comparison and physical mobile profiling are unverified. Partial #305, blocked paint-order #365/#369, and claim-only #641/#642 are not included in this batch's Fixes list.
