# Motion / paint / audio continuation — 2026-10-22

## #1165: completed browser integration acceptance

The already-composed Roller repair now passes its missing integration gates. No paint runtime was changed in this continuation. The new executable [harness](../../../scripts/check-inkwave-roller-band-live.mjs) uses the declared production build `.built-site/issue-resolution-final`, content hash `46e01879c9e4facd3ef99bdeb095b5962098036021ff6dd1a4685f44b8a0a3c4`, input hash `d10d948ff89e8d3a03e547c95fb46fbbf4d4892b3322f9c00c20de7f4fb457eb`. Every served artifact is checked against its manifest before delivery. This frozen build predates the concurrent uncommitted network/weapon changes; it is not an attestation of that entire new working tree.

Chromium 154.0.8037.57 / SwiftShader completed the final normal run in 44.69 seconds. The [full receipt](roller-band-live.json) records the complete served-artifact hashes. This is a constructed 8×8m Turf stage with the actual native Level, Physics, PaintSystem, Actor/Character, NavGraph, BotBrain, Projectiles and Match, with the actual S3 profile/runtime installed. It is not the menu/full scene renderer or a Switch/iPad performance test.

- At 30/60/120/144Hz, 30 overlapping opposite-team Roller stamps produced the same 120 simulation ticks and exact final ownership, 187:837 cells. Three readbacks per cadence cover growth and settled ink; maximum simultaneous growth was 3.
- The independent chronological band-core oracle, `sampleWorld` and `regionStats` each agreed at all 18,432 cell checks. GPU hard ownership agreed at 17,313 positions. Another 1,119 positions were classified by an analytic derivative/texel AA bound of 0.059397m; later opaque ink clears previous uncertainty.
- Native Actor at the published π/60 body-edge witness recognized own ink, submerged and refilled 50→56.6667 without HP loss. The enemy-ink control recognized enemy ownership and lost HP 100→96.4.
- Actual BotBrain refill found own-ink navigation and rejected the enemy-only surface. A further 90-tick actual `Brain.update → Actor.update → Projectiles.update` comparison produced **0 fire / 0 claimed turf** on fully owned ground and **45 fire ticks / 18.25m² / 292 newly owned cells** on opposing ink. The one-actor stage removes combat targeting; the declared midpoint RNG suppresses the optional random 2% repaint of already owned ground. No paint/nav/weapon methods are stubbed.
- The real Match judge, after 48 ordinary Roller stamps and a one-cell finish, declared the same 513:511 winner at all four cadences. All 1,024 cell-center GPU owners are compared strictly here, including AA positions: GPU, CPU and Judd all agree on 50.09765625% versus 49.90234375%.
- Page errors and WebGL errors: 0.

The parent agent independently reran the normal harness and passed in 44.03 seconds with the same 17,313 hard GPU and 18,432 oracle/world/region comparisons, bot painting and all four Judd results. Its separate [review receipt](roller-band-parent-review.json) and the [closure summary with evidence/script SHA256](roller-band-summary.json) are preserved here.

Two explicit [counterfactual mutations](../../../scripts/lib/inkwave-roller-band-control.mjs) confirm the gate detects the historical defects. These are separate mutated-input receipts, not manifest-exact normal build runs. The HTTP server first validates the original file hash and changes only the declared CPU method; the GPU shader remains intact.

| Counterfactual | Same oracle gate result | Receipt |
| --- | --- | --- |
| Original no-wobble CPU plus −0.03r inset | Fails at published π/60 witness, cell (11,12): CPU enemy 2, oracle own 1 | [original-core](roller-band-negative-original-core.json) |
| Original too-small candidate scan bound, corrected core retained | Fails at rotated rounded corner, cell (0,12): CPU enemy 2, oracle own 1 | [old-scan](roller-band-negative-old-scan.json) |

The scan witness deliberately uses radius 5 so the omitted corner exceeds the half-cell slack of this stage's 0.25m grid. The ordinary cadence/near-tie strokes remain 0.3/0.62/1.0, with a final 0.12 one-cell stamp. A radius-1 scan witness was too small to reveal this broadphase defect on that coarse grid and was replaced without relaxing the normal oracle.

Reproduce the normal run (counterfactuals add `--negative-control original-core` or `--negative-control old-scan`, and must exit nonzero with the expected CPU-oracle witness, not an unrelated error):

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/actions/.browser-cache \
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright/index.mjs \
node --max-old-space-size=384 scripts/check-inkwave-roller-band-live.mjs \
  --evidence-dir .browser-evidence/issue-1165-live/review
```

This completes the CPU/GPU/consumer/cadence/Judd consistency acceptance for #1165. It does not claim Nintendo's exact ink morphology or hardware parity.

## #1708: seven candidate recordings audited, no false source installation

The connected Drive candidate folder was inspected with the Google Drive skill. Seven candidate WAVs were streamed into private local attachments and compared to the original public Scratch project 964466348 by asset MD5; all seven matched. Three existing stock 2022 Splatling references also matched their installed SHA256. No audio binary, private Drive URL, or bearer download URL was added to the repository. The [derived identity/measurement receipt](audio-candidate-identity.json) contains public Scratch asset URLs and hashes only.

Heavy Edit candidate 1/2 were decoded to mono 48kHz and compared to stock Spinner Shot / Motor / MotorFire with maximum absolute zero-mean normalized waveform correlation over all integer-sample alignments at unchanged time/pitch. Peak correlations ranged 0.0266–0.1556. This does not establish the true weapon/event/version: it only fails to identify them as unchanged copies of those three stock waveforms. Edited/pitched/mixed copies and genuine retail identity remain unproven. Candidate labels and Scratch descriptions are insufficient provenance; none was installed as a verified native cue. The remaining Space Shooter, Big Swig flick and Painbrush sources were not acquired. #1708 remains open.

## Other assigned issues: precise remaining source conditions

The issue bodies/comments were rechecked. #287/#725 explicitly require measured intermediate sensitivity/control-gain anchors; endpoints and UI-domain fixes alone do not supply them. #952 requires the 11.3.0 charge-speed trace/formula connecting the known `.9` and `.05` source values; a guessed integration law is not justified. #997/#1097/#1116 require S3 ordinary-walk, family damage and Jump/JumpShoot selection/curves. The installed Wii U source bank really owns the affected hips/legs/upper layers, so adding another local family layer would not establish that missing active-owner behavior. These issues retain their existing targeted tests and remain unverified; no invented retail values or unseen long damage-loop substitutions were added.

#1823 is being changed independently in draft PR #1821. The issue's synthesis comment is stale relative to PR HEAD `c85f4f4892c48439d2aded8c46404857d64399d4`, whose current implementation replaces synthesis with a recorded Splatune 2 first-charge phrase and keeps onset/keep-emergence separate. That branch is not in the tested build and was not copied into this continuation. The PR itself distinguishes Splatune 2 recording from unverified S3 11.3.0 source/event parity. #1823 therefore remains open; no duplicate rise implementation was added here.
