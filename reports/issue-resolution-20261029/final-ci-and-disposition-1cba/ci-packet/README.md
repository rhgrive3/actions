# PR1914 final public-head CI and historical disposition packet

Sealed source snapshot: 2026-10-29T22:16:38.679Z. Tested public source: `1cba8c73e79565757f051bb106c6076440ca97d9`; main observed `91c1aa89061ddeec0685a7b32899b3b711995c60`. PR: https://github.com/rhgrive3/actions/pull/1914.

This packet is prepared for root review and later append-only publication on the existing diagnostic/inkwave-native-command-scheduler-20261029 branch (7a6 lineage). That documentation destination is not the tested application head. Separate matched-CPU diagnostics at be0001ac163380f46263839d3a6dc7dee620527b belong to diagnostic/inkwave-matched-cpu-3c85-20261029, preserve rejected calibration inputs and do not establish a performance improvement. No publication, main merge, issue closure, CI dispatch, rerun or cancellation is performed by this packet.

Current workflow receipt: 36 workflows, 35 success, 1 skipped; no failures or cancellations. CPU8/8, browser7/7, core and strict final validate pass. All 76 baseline Actions check families are created; no missing gates.

The permitted skipped checks are explicitly retained: circleci_offload_gate, CodeRabbit, immutable-source-pairs-and-focused-qa, render-diagnostic, wall-render-diagnostic, network-opening-diagnostic, video-lifecycle-pilot. A skipped or missing historical equivalent never counts as a resolved primary failure.

## Historical failed jobs and diagnosed causes

One failed job ID counts once. Multiple failure attempts are separate job records; repeated causes collapse to one diagnosed primary cause ID. Several historical jobs can map to one current gate: these are coverage observations, not that many newly executed jobs, and old run conclusions remain failed. Original111 is a subset of expanded146 PR records. Main12 remains separate and is never called successful main CI.

| Cohort | Retained failed jobs | Known primary jobs with current proof | Distinct diagnosed primary causes fully covered |
| --- | ---: | ---: | ---: |
| original111PR | 111 | 92 | 38 |
| expanded146PR | 146 | 113 | 50 |
| followup72PR | 2 | 1 | 1 |
| expandedCurrentPR | 148 | 114 | 51 |
| separate12MainContext | 12 | 11 | 16 |

Within expanded PR coverage, root-session repair evidence covers 108 known-primary failed jobs / 50 distinct primary causes. Separately preserved PR1916 owner work covers 6 jobs / 1 cause; root does not take repair credit for it.

Across PR and main context with cause-ID deduplication: 125 known-primary jobs / 52 causes. Excluding explicit prior-owner1916 credit: 119 jobs / 51 causes. These are context comparisons against the tested public head, not rewritten historical success statuses.

The strict same-workflow map preserves three absent historical workflow nodes. A separate failed-case proof covers job123276128714 through current core,123403939571 through all8 source shards, and123519674119 through all8 source shards plus the current native swim gate. All original failed bodies are retained. This does not claim the entire three old workflows ran on the current head.

## Unproven and excluded failures

All15 unproven primary events remain unresolved and excluded:3WebKit page crashes,4runner shutdowns,1native-menu timeout,4audio request-abort failures,1collected-promise failure,2silent setup failures. Logs and available artifact members establish observations; host/browser/native-input/abort provenance remains unavailable. Current passes do not establish the old underlying cause.

ExpandedPR secondary-only failed jobs: 19; main-context secondary-only jobs: 1. Another6 operational fan-in records remain a separate excluded cohort. Strict fan-in rejection is not another product defect or a primary resolution.

## PR and issue attribution

Audited PR union: 26. Root published repair heads on8 distinct PRs:1907,1908,1909,1910,1911,1912,1914,1915. Only1914 is the current open CI target; seven are earlier repair histories.1913 and owner1916 are not counted as root-published repairs. All26 audited PRs are not called fixed.

Confirmed completed issue closures:3. Relative to initial audit 2026-10-29T06:20:00Z,79 and725 are2 later closures;1767 closed2026-10-28T22:05:22Z before that audit. Same-account timeline identity does not establish which process closed an issue. Latest issue census retains26 open issues excluding401; no issue is closed by this packet.

## Actual included bytes and limits

The file manifest includes 102 deterministic gzip payloads before this README/manifest. Exactly15 historical unknown-job and2failed72followup original retained logs are included. The160-job inventory explicitly distinguishes actual included bytes from local-only raw/source-excerpt references; it does not imply160 full raw logs are archived here. Current successful logs and selected full artifact members are separately labeled. Full binary artifact archives, audio and browser snapshots are omitted where not compact; no trace ZIP is implied when absent.

Every gzip payload was round-tripped and records raw SHA256, gzip SHA256, byte counts and restore guidance. Source and receipt SHA values refer to actual included bytes. No extra local tests, GPU/browser tasks or hosted CI were executed for this audit/packet. Historical failures, software completion candidates, issue closures, review findings and performance measurements remain separate dimensions.
