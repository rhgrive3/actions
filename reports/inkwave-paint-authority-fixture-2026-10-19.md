# Paint authority: extracted core-test fixture repair (2026-10-19)

## Scope

Test-only repair of the critical-queue and weapon-edgecases fixtures. No gameplay,
network protocol, build adapter, model or production file changes. The Validate
workflow receives only two trigger-path additions described below.
The existing [S3 behavior comparison](inkwave-splatoon3-behavior-2026-10-02.md)
remains authoritative for gameplay findings. This change adds no S3 parity
claim and does not replace device or browser testing with CPU measurements.

## Reproduction and cause

[Validate Core job 118025852375](https://github.com/rhgrive3/actions/actions/runs/39242322009/job/118025852375)
checked out PR #1656 head `5bfba2bbecde6bd73789db79835c6fa83af04f47`.
The two composed remote-paint tests failed with `ReferenceError:
admitPaintAuthority is not defined`; the other 14 tests passed.

The [production adapter](../patches/network-replication/paint-authority-adapter.mjs)
imports the real authority helpers, but the test extracts function bodies into
`new Function` closures and omitted their newly required dependencies.
Its old authority-less events also no longer satisfy the production contract.
The [authority implementation](../patches/network-replication/paint-authority.mjs)
requires an owner-bound proof in the five-element paint-order row.

A read-only source overlay reproduced the same 14-pass/2-fail result on main
`00b8994711809ba6d0469723c858ddef6805e2ae` and PR #1656. All 317 consumed
source blobs were checked against both official Git trees and were identical;
this is a pre-existing fixture failure, not the parity-lifetime change.

## Repair and retained coverage

- Import actual `packPaintAuthority`, `admitPaintAuthority` and
  `consumePaintAuthority` from one module namespace; inject the two consumer
  dependencies into their extracted closures.
- Build events using the actual producer and a registered host-owned actor,
  current session, monotonic event sequence and valid network metadata.
- Preserve all 21 source-kind checks, malformed/throw recovery, replay dedupe,
  clock/sequence assertions and nested-application protection.
- Keep the original 10 malformed inputs and add five rejection cases: legacy
  four-field row, null proof, unknown actor, wrong generation, and a member
  that does not own the actor. Positive and malformed cases use independent
  sessions; no observed clock is reset to force acceptance.

## Verification

Reproduction command in a complete checkout:

```sh
node --test tests/issue-queue/critical-queue.test.mjs
```

The strict candidate overlay passed **16/16** (319 consumed paths, zero
unapproved source mismatches). Candidate test SHA-256:
`b3dfe38f722c3964ff58bfd69fa3ef6e259c80b74ef6f9c7048f8989e3c66e3a`.
Three diagnostic mutations all failed as intended:

1. Missing admission closure dependency: two ReferenceErrors.
2. Missing consumption closure dependency: two ReferenceErrors.
3. Removing the actual admission guard: invalid null proof reaches consumption
   and fails the malformed-input test, rather than silently passing.

Published main-00b modules were also checked against official Pages artifact
`12183076203`, ZIP SHA-256
`965dc2077b211da29b8785bc4092314fb668a1d5d5f86235f661075611dcadb3`.
At public revision `1d40eceb15eb12d492e0682de1a8788c6d56a60cd13a876cb1d526df7e155cc5`,
the emitted NetMatch and authority module returned HTTP 200 and matched the
artifact manifest. All four real authority imports had actual call sites.
This verifies deployed import wiring; no live runtime exception was reproduced.

No new gameplay browser run is needed to establish this isolated test-fixture
repair because the production tree is unchanged. The final PR head must still
complete every required CI check; these targeted results are not full-CI approval.

## Workflow trigger correction

The initial two-file draft did not start Validate: its existing push and pull
request path filters omitted `tests/issue-queue/**`. Add that path to both
filters so this fixture and future tests in the same suite actually trigger
the unchanged full gate. All existing filters, jobs, assertions, permissions,
checkout identity and timeouts remain byte-for-byte unchanged. An independent
contract checks both matching events, every previous path, and complete parsed
workflow equality after removing the two additions; omitted-trigger and
removed-existing-path negative controls must fail.

## Launch-packet fixture uses the real owner and roster

[PR #1656 patch-shard-6 job 118025852569](https://github.com/rhgrive3/actions/actions/runs/39242322009/job/118025852569)
failed `weapon-edgecases.test.mjs` at the launch paint-count assertion. The
roller correctly produced 13 projectile packets but zero paint packets: its
fixture actor had no owner and was absent from `NetMatch.byNid`. Main00b
reproduced the same failure; the original test blob is identical on both heads.

The additional setup-only change assigns the actor's owner, host and match
identity and calls real `NetMatch.bind({actors:[a]})`. It removes the fake
`isMine=()=>true` override. The production authority gate remains unchanged.
All original assertions remain: roller13/splatling1 projectile packets,
paint1/0, transmitted velocity tolerance, ghost cardinality and no duplicate
owner output. The corrected roller proof identifies actor1/generation0.

Independent full source suite: baseline27/28, candidate28/28; 429 consumed
source paths checked against main00b with no mismatches. Candidate SHA-256:
`6596fa84026f5bfdb81ec7628a076d013d960662781d4001d84081e931733603`.
Five negative controls reject missing owner, missing binding, foreign owner,
and isolated missing paint owner/roster after binding. The last two diagnostic
negatives retain the historical fake ownership override only to isolate the
paint guard; they are not part of the candidate. This test deliberately uses
its existing source fixture, so these results are not emitted/browser proof.

The prior `cff0b2ddaeab208432bb462f521b9b02f70737e9` Validate run had no
assigned runners or executed steps at the pre-update check. Updating the same
PR activates its existing concurrency policy and supersedes that queued run;
it does not turn that old run into a success. Final-head full CI remains required.

Combined core, actual #522 authority consumers and full weapon-edgecases: **52/52**
passed (zero skipped/failed, 650 consumed paths with strict official-source
binding and only the two declared test overlays). This supplements, not replaces,
the required final-head workflow.
