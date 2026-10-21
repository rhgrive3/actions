# Network placement observation, not a gameplay correction

Direct parent: 8db288ece48c882f42eb0d3540218af58d6af6e4. Six QA-only paths. No runtime, model, timeout, placement validator, damage, packet acceptance, or proof threshold changes. PR1765 and Kraken remain fixed.

## Existing evidence

- Failed literal8db job119497626507/run39679157896: placement validation failed before firing. Artifact12383578893 ZIP SHA256 1aacc65dcab15375269d62ea725b45b0679589bf13ed45c0e985b14f647da501.
- Passed literalffdb run39658991486 artifact12375648983 is the comparison source. ZIP SHA256 989b068ea95111f89607f20c5ec7536bc71a9c8f1b5952fe7bf0d9f949030125.
- Both result JSONs have inputHash68591cc3b710e3c83e5f8e92d9be6a673c95da4394f19ac4b53457eb826a31f3, contentHash2ceba653d36b11a399938667bc5901847284737a687b6b9c1b81de9e725ebf92, and harnessHash774c737f2d576e3147f23149cc123e0d9436a4517b13a70aed85fb0b5d0ca93b. Selected neutral points are equal. This does not establish identical network timing.
- Failed guest's host-owned victim proxy(nid0) was at [0.91,6.7,-38.58], while guest-owned attacker(nid1) remained at [12.5,~0,0]. The original driver places both local owners and remote proxies with spawnAt, then clears buffers, then executes 12 native steps.
- Actual production-composed Actor.spawnAt increments netLife and resets gameplay state but does not clear net.cur/ready. NetMatch._sample returns when its buffer is empty; applyRemote can then use the retained ready sample, including its old position and life. A real source Actor/NetMatch Node counterexample demonstrates this possible path. Its Visual and physics are stubs and no socket is involved, so it does not prove the original browser failure's chronology.

## Observation contract

Optional --observe-placement records frozen state, immediate post-placement state, before/after native net.update and after actor application for the original 12 settle steps, and the final validation read. Maximum48 rows and2 actors per peer. Sample buffer endpoints, cur/ready, owner-is-self, life/epoch, native peer playback clocks, input intent, and position are read only. No private _peer call, acceptance write, snapshot synthesis, or step delay is added. Existing failure status/exit remain failures. Observations are in the artifact only; existing sanitized stdout is unchanged.

Observer overhead may change timing and make the failure disappear. A passing diagnostic is not a fix or final-head mandatory acceptance. The bounded rows may not expose every packet arrival; absence of a sample is not proof it was never sent.

## Preserved build reuse

The diagnostic reuses original ffdb build artifact12379998715/run39658991486 after exact ZIP SHA verification. Its ffdb marker is retained. Before browser execution, verifyRuntimeBuild checks every compiled artifact and all original input bytes against the new diagnostic Git checkout; both expected input/content hashes are pinned to the original successful and failed receipts. No manifest rewriting or rebuild. The direct-parent/allowlist guard separately proves8db runtime is unchanged.

## Local checks

Three observer Node tests pass, including frozen read-only state, bounded records/nonfinite sanitation, and invalid stage rejection. The production-composed stale-sample Node counterexample passes with explicit renderer/physics fixture boundaries. Native diagnostic execution and original-failure causal confirmation remain pending.
