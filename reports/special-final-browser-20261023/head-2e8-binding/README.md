# PR1854: bind browser evidence to QA-only head2e8

**Production/build-input equivalence passes. The observed common renderer stall is not established as a candidate-specific regression. Exact-head CI is still pending in the recorded snapshot; no final acceptance or merge is claimed.**

## Official identity and explicit evidence binding

Official GitHub readback confirms PR1854 open/Draft at `2e8d90b8afb6aac057edfbb988fae789ef36cfd3`, sole parent `4c9b7861038189e709db5e80e64d2a2712f7b877`, tree `54d7fabb65d8148bcdbdfbaf52425bd6645353bb`. The only changed leaf is `scripts/tests/inkwave-reviewed-special-delta-admission.test.mjs`, mode100644, blob `ee7325945233057573b807babec13cd5536b523f`, SHA-256 `8e26e73560f2ee0dce55f30e422cbd70b52bfb8fbc4489d124f836bca5d84ada`. Official file bytes, local fetched Git bytes and the supplied hash agree. The other **6326 of6327 leaves** retain identical path/mode/type/blob, including all production code, build controls, QA drivers and assets.

Every one of the sealed normal build's **1421 inputs** was physically rehashed, matched to its4c9 Git blob, and matched to the same2e8 Git blob/mode. The changed test is outside this input set. The builder script also matches. All2112 artifact-map entries plus the manifest were read again: **2113 output files**. Identities remain:

- inputHash `3fbcdb527d87ae0318e1e1df3037088e8d82ae8f979d6d7cae00b9a353ce4f91`;
- contentHash `bd3d8d2715b53a842901be6457bdb777621c4290f60a2c37a1404e4f9e5d3707`;
- build revision `a73fa9410e41bf635a38b36165e333965ae4d0f606b0b28f6fd9965e37fdd4f9`.

The original local browser captures **remain captures of the fresh4c9 normal build**. They are applicable to2e8 through this exact unchanged production/build-input proof; they have not been relabelled as newly captured2e8 images. The independent new-head CI build separately reports these same identities. Old-head CI success is never transferred to the new head.

Proofs: [summary and bound evidence hashes](binding-summary.json), [all1421 input rows](build-input-proof.json), [all6326 unchanged leaves](unchanged-leaves.json), [official identity readback](official-identity.json), [verification code](verify-binding.mjs.txt). Original failure files and the [corrected Reef observations](../reef-lifecycle-diagnosis/README.md) remain intact. No runtime fix was made for that probe timing error.

## New-head CI checkpoint

Only records whose `head_sha` equals the full2e8 SHA are included in [CI status](ci-status.json), with observation time retained. At that checkpoint:

| Workflow | Run | Actual status |
|---|---:|---|
| 19-special source/runtime boundaries |39953697737|success|
| Projectile visuals |39953697916|success|
| Crab/gyro |39953697768|success|
| Main weapons |39953697822|success|
| Alpha volume/rendering |39953697839|success|
| Reopened six |39953697793|success|
| A+ quality/security |39953698074|success|
| Combined QA dependency validation |39953697752|skipped, not pass|
| Validate INKWAVE update |39953697907|in progress|

The combined job is gated to the different branch `test/inkwave-combined-qa-20261021`; its skip is expected from the unchanged workflow predicate, but is not counted as success. Validate still had core, responsive and active-browser work in progress. No failed new-head CI job was observed at this checkpoint. No CI was dispatched or modified.

Projectiles run39953697916 completed `Capture before`, `Capture after` and **Compare all48 original native captures** successfully. The compare log reports48/48 matched pairs, physical verification pass, post-native-fire RNG matched and GL errors0/0. The repaired fail-closed workflow-route step passed on the after side. [CI success receipt](projectile-ci-success.json) retains exact run/job IDs, log hashes, result lines and artifact identities. These are **CI browser results**, separate from local browser work; they are not a Nintendo fidelity claim.

The supported server branch read still resolves main to the pinned726 SHA and reports `protected=false`, no required-status contexts; rulesets read returned empty. The attempted `/rules/branches/main` URL was rejected once by the connector URL allowlist, without an access change or retry. Task-mandated acceptance gates remain required regardless of server enforcement; absence of protected contexts is not used to waive them. Main was never used as a moving build baseline.

## Bounded performance diagnosis

Three bodies of evidence now agree that the observed stall is shared with the parent:

1. The earlier fresh-context native Reef case had the **same native tick437/relative44/dash** JS-frame stall:15,584.8ms candidate and15,593.5ms parent, with one normal render in each observed frame. Reset/reuse/death assertions passed on both sources.
2. A new observer attempted the same first-dash setup with **every initialization and observed frame rendered**, no suppression anywhere. It bracketed whole `Game._frame`, the frame renderer, Three renderer and existing GL calls without adding a fence/query/flush or changing flags. Both sides stopped at the unchanged30-second operation limit **before any special activation**: candidate during initialization batch10 after100 completed samples/tick103, parent batch13 after130 samples/tick133. These are **failed/incomplete diagnostics**, not passed gameplay cases. The failing10-frame evaluations unwound later; late ticks113/143 are retained as post-failure readback and are not counted as passing samples. No timeout was extended and no assertion relaxed.
3. The new-head hosted projectile CI's paired live-fire windows also show slow native wall delivery on both exact builds. Its before build contentHash is exactly the local parent `caa80f320098ca6b8d4cbedd4b8f6ca2b8652663cfb120412abf8dfb78f4d100`, after is the sealed candidate hash above. [Before](ci-capture-before-summary.json) and [after](ci-capture-after-summary.json) records retain the raw summaries.

In one completed parent initialization frame/tick81, whole-frame JS wall time was8162.9ms; frame renderer8155.2ms, Three render8151.0ms and the existing **`WebGL.drawElements` call8125.3ms**, with7.7ms outside the frame renderer. This locates that observed long wait inside a synchronous renderer→WebGL call, rather than the outside-frame simulation bracket. It does not identify GPU hardware work, driver queueing, shader compilation or another native wait as the cause. The exact internal location of each timed-out batch was not recovered. Full [raw timing/failure records](renderer-observation/summary.json) and observer source are preserved.

The hosted live-fire CPU-frame samples do not show a candidate slowdown: desktop median34→29.2ms, p9539.4→31.5ms (13 samples per side); emulated-mobile median29→25.9ms, p9543.3→35.6ms (12 samples). The CI field `fps` was0.167→0.266 and0.514→0.835 respectively. Source inspection confirms this field is1000 divided by the median **native `_frame` entry wall interval**, distinct from fixed simulation ticks and CPU-frame brackets. It is not physical-device/display FPS. GPU timing is null on both sides. These small, separate-runner samples support only the scoped absence of a demonstrated candidate-specific regression, not a general improvement claim.

Limits remain: the new timed contexts were sequential in one browser process, so are not a matched cold-cache benchmark; exact parent reproduction of the earlier49s/89s sustained-submission totals is still absent; no GPU completion or compositor timing was measured. There is no basis here to repair candidate runtime for this common stall, and no claim that normal hardware real-time performance is accepted. The local diagnostic failures and remaining CI are visible, not converted into passes.
