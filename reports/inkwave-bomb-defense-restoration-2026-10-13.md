# Restore native bomb defenses after the 18ce composition

## Scope and evidence

Baseline: `18ce7b6c8b4c612f289787332b6be65862f34bea`; predecessor: `14f9f913a8438353d0e462a0e74e17d8af876230`. This is a bounded restoration of already-adopted behavior lost when older bomb-related files replaced the predecessor. It is not a blanket rollback of the new network correction.

Four unchanged predecessor assertions pass on 14f9 and fail on 18ce through the composed runtime:

- Curling direct contact: the native defense candidate becomes null. Restore Curling admission, its `damageDirectHit` amount and subtype, so the existing `Bomb_CurlingBullet` object row receives the native 20 HP contact instead of a generic blast.
- Bomb AoE against a native Sprinkler: the removed AoE path leaves HP uninitialized/unchanged; restore the shared Bomb object row and apply Object Shredder once.
- Vac and Wail AoE: restore Vac frame damage, the native Sprinkler object view and the explicit Wail LOS-piercing path.
- Remote Sprinkler AoE: restore raw-damage/source-row proposals; only the device owner scales and changes HP. The attacking replica remains read-only.

The three removed AoE tests are restored verbatim from the predecessor. The new 18ce test proving no candidate-vector allocation for ineligible device collections is retained. The runtime keeps 18ce's lazy segment-vector creation, ghost-bomb victim-local authority and Bubbler shielding changes. Quotas, FIFO, producer-identity reset, same-owner replacement are unchanged. The later floor-projection restoration is documented below.

## Verification

- Predecessor source: Curling 1/1 and saved original AoE tests 3/3 pass.
- Exact 18ce source: the same four cases fail, with null Curling candidate and absent Sprinkler damage/proposal.
- Corrected source: 34/34, zero skips, across `kit-defense.test.mjs`, `native-sprinkler-damage.test.mjs`, `installed-bomb-victim-defense.test.mjs` and `bomb-catchup-work.test.mjs`. These include authenticated victim-local bomb damage, future-life and Bubbler controls, unchanged replica HP, source rows, replay rejection and deferred geometry work.
- One additional full-installer Curling producer/contact case passes source and actual minified output, and fails on the exact 18ce minified baseline with a null candidate. It does not manually install the source defense function.
- Actual emitted-site invocation: the original 34 cases plus the new Curling case pass (35 total, zero skips). Scope: 26 full-installer/emitted cases; nine older kit-defense cases retain a source `installKitDefense` import over emitted projectile code. Those nine are not evidence of minified defense-module behavior. The added case closes that Curling gap.
- Exact 18ce minified negative: the three restored Sprinkler AoE cases and the new full-installer Curling case fail. The old Curling test passes against that output because of its manual source installation; that attempted negative is retained and not counted as an emitted negative.
- Candidate build: esbuild 0.28.2, content `eb6875ed3b373e498c0915a04363b75370188392d4eb5fb4ef8b26eef8989278`, input `e704a9d7fa2b708d59e9f669d1c2ab8ea157f5d040ba6dc91429763910ac4c63`. Exact 18ce baseline: content `99a82bafc4b265ea325512f704794be0a347e848c5c7338fe2f4f72340f54f1a`, input `751501c48a0af94bbe2a757de8951a65eccfa8f3f884ed00074514fe79cc01ac`.
- Independent review accepted the two runtime restorations and independently passed the original 34 source cases; the additional full-installer Curling source case and final test/documentation readback were also accepted.

Reproduction: `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=768" node --test --test-concurrency=1` followed by these exact paths:

- `patches/splatoon3/tests/kit-defense.test.mjs`
- `patches/splatoon3/tests/native-sprinkler-damage.test.mjs`
- `patches/network-replication/tests/installed-bomb-victim-defense.test.mjs`
- `patches/network-replication/tests/bomb-catchup-work.test.mjs`

Use `INKWAVE_BUILT_SITE` to select an actual production build for the emitted lane. Original failure logs are preserved outside the source tree.

## Reference and limits

The restored values and source-row behavior use the existing versioned Splatoon 3 source tables and predecessor tests, including `DamageRateInfoConfig` / `Bomb_CurlingBullet`. No new retail timing or damage value is inferred. This is composed-code regression evidence, not a new retail capture or browser visual comparison. Four existing 18ce inherited-axis/launch/fuse/30–120 Hz drag/guide cases pass unchanged. The removed floor-projection seam was separately reproduced and restored as described below; the other removed literals are not treated as proven runtime regressions.

The previously disclosed quota/FIFO performance hold remains: historical corrected-producer Scorch Node-VM trials retained all 161 attacks, but still showed six consecutive over-budget frames and up to 100 ms of additional synthetic owner-clock admission wait. Those are historical fixture measurements, not fresh measurements of 18ce or this correction. Restoring these behaviors does not establish a stutter fix or device/browser performance acceptance.


## Separate fifth regression: Curling floor projection

After the first correction was frozen at `e43aa4211504243b6761e726ee9e635e85907a24`, the unchanged `Curling trail projects to a surface only within the source PaintCheckHeight` source test failed against 18ce: no raycast was made (`reach=-1` rather than `2`). An actual emitted full-installer probe passes predecessor content `bbb2d5efa3e1e9726fef85a241fa7ac00f02eda09b92ae83df0d3bcd5397d6fa` and fails exact 18ce content `99a82baf…`: the predecessor searches downward by 2 world units, stamps the hit point plus 0.1 normal bias, and emits no stamp on a miss. An initial observer used a cross-realm Array comparison and failed before the predecessor assertion; that log is preserved, and the corrected observer only converts result arrays to host arrays.

The separate commit restores exactly the predecessor `kitBombTrail` body, including its default installed `G_REF` and per-system reusable ray scratch objects. A byte-level substitution reconstructs the entire 18ce `kit-subs.mjs` exactly, proving no other bytes changed. In particular the same-owner ghost Sprinkler replacement remains. No launch coefficient or unused air-resistance export was added.

Verification on the combined correction:

- Full `patches/splatoon3/tests/kit-subs.test.mjs`: source 38/38, zero skips, including the old native PaintSystem control, old projection regression and new full-installer case.
- New full-installer projection regression: actual emitted 1/1 pass, exact 18ce emitted fails on missing raycast. It uses a real native Curling producer and the production four-argument call/default context. Terrain hits and paint recording are controlled fixture surfaces, so this is not an atlas/GPU visual result.
- The four defense/authority test files above were rerun against the final combined code: source 35/35 and emitted-site invocation 35/35, zero skips. The emitted distinction remains 26 full-installer/emitted plus nine older hybrid source-installed-defense cases. With the separate floor case, there are 27 actual installer/emitted cases and nine hybrid cases, not 36 fully emitted cases.
- Combined production build: esbuild 0.28.2, content `b1cedb52073238d645239872a3767a69f70107e69965364b92293fd79d6a3c50`, input `789cfde5088106a3ef7e145e5170d500d30339ca0c6308461685417288ef9c17`. The earlier `eb6875ed…` build is historical first-correction evidence.
- Independent review accepted the exact floor runtime hunk, reran its new source case successfully and accepted the final combined commit. A single command in the existing built-weapons fidelity step now runs both new full-installer Curling cases against the production build; no job or separate workflow was added.

Reproduce the additional actual emitted case with `INKWAVE_BUILT_SITE=<built-site> NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=768" node --test --test-name-pattern="^full installer Curling trail" patches/splatoon3/tests/kit-subs.test.mjs`.
