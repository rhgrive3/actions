# Shooter aim obstruction owner — candidate awaiting browser acceptance

Code `9a4516bc6f5fa6d3fb03831b884a795934a363ae`, exact base `90706e3778586fa6c9d09a64ac354e547086e1c0`. This is a source/text-only handoff for independent review, not a retail-parity or browser-acceptance claim.

## Evidence and causal distinction

The parent and native-reference worker actually inspected the ordinary public Game8 embedded clips on https://game8.jp/splatoon3/497691 . The BEFORE clip is in the Ver.9.2.0 comparison section, captioned「確定数維持射程約2.4」; exact pre-update build, gear and input are unknown. Their native1180×757 screenshots show active purple firing and67.4 damage near scrubber0:01, with a small gray hollow circle around599,353 inside the outer white dashes. Near0:03 after target destruction the gray cue stays around598,352 while floorpaint and the target remnant are lower. Paired AFTER footage also retains its gray aim cue. This is the fixed **HUD aim point**, not literal screenshot centre: the video is letterboxed around y47..710. Idle blue/cyan target-response artwork is a different element. No distinct lower circle was observed, but co-located or ink-occluded feedback cannot be excluded. No numeric visibility cutoff was established.

Those pixels were inspected by the parent/native worker, **not independently by this executor**. The two named parent JPEG paths are absent here; no Nintendo media is included in this branch. Reference provenance/limits are explicit in reference-observations.json. Original observations support separating the aiming cue from an eventual paint landing, but do not specify Nintendo's complete obstruction algorithm.

At the base, the existing aiming ring and outer dashes already share `ShotGuide`. A separate9px `.iw-xh::after` ring is fed by `muzzleBlockFeedback → s3ShooterImpact`, the first field hit over the full projectile flight. That extra cue can represent a later gravity landing in an unobstructed lane. This patch changes **only that extra cue's owner**, leaving the main ring/outer guide, target-response classes, shot physics and paint unchanged. It neither hardcodes screenshot centre nor forces the markers concentric.

## Candidate geometric rule and API

`muzzleBlockFeedback(actor)` retains its existing full-flight field-contact result, cached copy and invalidation contract. The production HUD requests `muzzleBlockFeedback(actor,true)` for an intended-aim obstruction result instead.

The obstruction query starts at the existing collision-safe muzzle and follows the existing `_aimFrom` direction towards the canonical aim point. It sweeps the shot's sourced field collision radius (canonical Shooter0.2; existing impact-radius fallback for legacy profiles). Its endpoint is the full shot's first-contact **forward extent**, `max(0,(impact-muzzle)·aimDirection)`. Thus an unreachable distant wall cannot warn merely because the camera ray eventually finds it. If the actual full-flight query has no contact, there is no obstruction cue. This forward bound is a local geometric reconstruction, **not an extracted Nintendo UI algorithm or a new duration/range cutoff**.

The HUD result comes directly from that corridor's first surface contact. It is not admitted/rejected by exact identity with the curved trajectory's surface, and no entity-wide/floor-wide equivalence is introduced. A separate cached Hit copy prevents shared scratch or the full-flight Hit from overwriting it. Both views reuse the existing verified collisionRevision/owner/world/function keys; unsupported worlds still recompute. Only one additional bounded sweep runs on a cache miss; two vectors/one query Hit are reused, and one extra copied Hit is allocated lazily on the first obstruction.

This intentionally gives two distinct points in the nine-frame wall counter: the direct corridor contact is approximately(-0.128344,0.778429,11.95), while the unchanged actual curved shot impact is(-0.128344,0.278962,11.95). Both are on the real wall. **The HUD point is not claimed to be the ballistic impact or an original-game measured coordinate.**

## Focused checks

- **Source26/26**, zero failures/skips: projection/contact, #94 real impacts and volume grazes, legacy feedback read-only/cost, and collision/cache contracts.
- **Optimized emitted14/14**, zero failures/skips: actual built projection/contact and cache modules. The two older #94 test harnesses are source-only and are **not** counted as emitted checks. VM audit records794 runtime module compilations from the supplied site plus two synthetic test roots, zero source-runtime fallback.
- Horizontal open lane: the actual full-flight floor hit remains available at frame9; the HUD-only obstruction result is null. A valid wall hit also occurs at frame9 and retains a physical wall cue, proving this is not the rejected8F cutoff.
- Downward floor at three pitches remains a genuine corridor contact; the existing30/60/120Hz actual-head assertions still match the unchanged physical floor impact. Near cover and both side grazes remain visible using the sourced field radius.
- An aim-ray wall at z50 behind the actual floor landing cannot become a false warning. The existing far-wall/open-void lifetime control also passes.
- Real Tower movement drives HUD hit→clear→hit→clear, while the full-flight and legacy feedback APIs continue returning the changed physical landing. Existing unknown-world, hidden-Physics-owner, native triangle replacement, notified solid/rebuild and owner/query replacement checks remain intact.
- Exact prior90706 muzzle-feedback module substituted only in a test process: **two expected failures** for the open-lane and distant-wall controls. An injected age gate: **one expected failure** on the real9F wall. No production age gate or historical candidate was applied.

One old #94 HUD expectation was intentionally replaced: it required projecting the open-floor landing within an arbitrary90px radius. The physical impact and legacy feedback agreement assertions remain; the composed HUD now must omit that extra floor payload. Tower tests retain their numerical full-flight comparisons and add HUD presence/absence transitions. This does not waive collision/cache assertions to obtain green.

An early prototype changed the legacy API result and matched exact surface IDs; it was rejected locally before publication. Its Tower failure was initially misread as a multipart-object mismatch. Detailed tracing showed the moved Tower actually cleared the corridor and the shot later hit the floor; clearing the HUD cue was correct, but suppressing the legacy data API was not. The final API separation preserves that control. No genuine Tower surface-identity counterexample was established; the final candidate does not require such matching.

## Exact build and commands

Build `/tmp/inkwave-shooter-corridor-owner-90706`:

- content `39d1892cc3348ef9152227f035307356918bf4834436b96ccce8290ca6c6ad6b`;
- input `511a1bee578eadba62c93897ff16e2bddc86e01a77f87b6f239640fce6558be4`;
- **1493 exact git-tree source inputs and2199 artifact hashes, zero mismatches**, bound to the code commit above.

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/shooter-dualies-projection.test.mjs patches/splatoon3/tests/issue-94-impact-agreement.test.mjs patches/splatoon3/tests/shooter-shot-guide-cache.test.mjs patches/splatoon3/tests/issue-94-muzzle-feedback.test.mjs
node scripts/build-inkwave.mjs inkwave-public /tmp/inkwave-shooter-corridor-owner-90706
INKWAVE_BUILT_SITE=/tmp/inkwave-shooter-corridor-owner-90706 node --experimental-vm-modules --test patches/splatoon3/tests/shooter-dualies-projection.test.mjs patches/splatoon3/tests/shooter-shot-guide-cache.test.mjs
node reports/brush-downhill-contact-20261027/audit-build.mjs /tmp/inkwave-shooter-corridor-owner-90706 /tmp/exact-source-audit.json
```

## Browser blocker and remaining acceptance

The ordinary public-page browser attempt used `/usr/bin/chromium` with `chromiumSandbox:true`. It failed **before navigation**: `FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:172` says the SUID helper binary is found but incorrectly configured; the log requires `/usr/lib/chromium/chrome-sandbox` to be root-owned/mode4755. Crash Reports writes also hit a read-only filesystem. No system/security setting was changed or launch retried without sandboxing. This is an environment launch failure, not an automatic approval denial. The raw receipt stays local; its hash and exact failure are in browser-environment-block.json.

A separate existing executor with a working normally sandboxed browser is required to inspect the exact candidate's ordinary-input pixels: horizontal long lane firing/release, looking down, genuine near-wall obstruction and valid wall behavior, plus moving obstruction clearing. Inspect the aim group and extra ring independently, and record native input receipts. Candidate browser acceptance, gray aim-anchor calibration, original obstruction coordinates/limits and physical-device timing remain unverified. No new PR, metadata retry, manual CI or Nintendo-media upload was performed. All checks have exited; this handoff is for review and that remaining browser step.
