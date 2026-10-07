# Flow progress and life transitions (#468 / #471 / #306)

Public target: `inkwave-public/` through the Splatoon3 build layer. Native source/upstream locks remain unchanged. Initial current-main baseline8158a2b; publication is rebased onto the then-current main.

## Reference and limits

Reference version: Splatoon3 Ver.11.3.0. Nintendo's [Flow introduction](https://www.nintendo.com/au/news-and-articles/whats-new-in-the-splatoon-3-version-11-update/) establishes the feature/30-second duration; the exact progress/lifecycle details below come from the [community's current verification](https://wikiwiki.jp/splatoon3mix/検証/イカフロー), read2026-10-04, not an official Nintendo numeric specification or a newly performed Switch experiment.

The verification describes a100-fp threshold, -.2fp/s decay, -3.3fp/s after5seconds with no gain, -5fp ordinary death, -10fp fall/water, and active Flow surviving death while its duration runs out. Those loss parameters are labelled community verification in `flow.progress`. Existing award weights/threshold remain independently uncalibrated. This change normalizes losses by `cfg.threshold / referenceThreshold`; it does not silently recalibrate splat/assist/turf awards or claim complete reference Flow scoring. Tests exercise both the existing0–3 scale and a100-fp representation.

## Before / candidate

- #468:50 equivalent fp stayed50 after6idle seconds. Candidate splits any step crossing5seconds and produces45.7fp. Positive actual awards restart the inactivity timer; zero/negative/nonfinite/unknown awards do not. Progress clamps to0. Decay applies to the issue's alive/inactive state; dead inactive progression is not given a newly inferred decay policy. The active lifetime clock remains separate and continues while dead.
- #471: every splat and nested respawn reset discarded all progress. Candidate reads the existing authoritative cause, subtracts5/10fp, and preserves the post-penalty state through the native `respawn -> spawnAt -> reset` chain.50fp becomes45/40fp immediately and on immediate respawn. Dead updates do not add awards or a second death penalty.
- #306:20seconds active became0 on death. Candidate keeps the same authoritative state object, so2seconds dead leaves18seconds; respawn retains the effect. Expiration while dead stays expired. Direct reset/new-match spawn still creates fresh state.

`respawn` provides a narrowly scoped WeakMap preservation context with `finally` cleanup. No persistent actor-global keep flag can leak into a later battle reset. The state is restored before native respawn emits its event. `actor:flow` refresh notifications expose the restored state to independently installed AP/effect consumers. Victim assist-credit cleanup stays independent.

The real Character Flow exterior immediately hides on death, while gameplay state remains active. Returning from the same surviving Flow resumes the steady aura without replaying entry particles, incrementing activation count or causing paint. A full reset, expiry or disposal drops this continuation. Shared effect resources remain bounded.

## Regression evidence

- Focused gameplay12/12: actual Actor death/respawn/reset, positive-gain clock, piecewise decay, penalties, clamp, stale splat sequence, assist cleanup, active expiration, effect restoration and30/60/120Hz fixed-clock equivalence.
- Gameplay plus full installed Character Flow-motion24/24: death hides immediately;1second of dead time is subtracted; native respawn restores visible steady Flow without a new activation event; resource count unchanged.
- Actual minified public modules12/12. Public build and10/10 motion/workflow verifier gates pass.
- Actual PR341 headf81652b6fb478241a54c3676d33d3c030a186133 gear/Flow-AP code composition12/12 passes: run effect persists/reapplies on respawn. Preserve the candidate reset event's restored active value, rather than reintroducing PR341's old unconditional false event.
- Negative baseline8158a2b reproduces50fp after6idle seconds,0fp after ordinary death, and active20seconds becominginactive/0 on death.
- The first aggregate run was started before the old death-clears-Flow test was updated and correctly rejected that stale assertion. The replacement retains its death-hides-visual assertion, requires gameplay persistence, and adds real respawn/no-replayed-entry checks. The corrected24-case run passes. Final aggregate/remote results are reported on the PR rather than claimed before completion.

No mobile GPU or physical Switch comparison is claimed. No new Flow award table, extension duration, AP strength, network authority, merge/deployment or settings change is included.
