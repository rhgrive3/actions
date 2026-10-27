# Catalog lazy charge-Worker graph correction

Isolated candidate on `90706e3778586fa6c9d09a64ac354e547086e1c0`:
`4870f55f6da9d8252b434270643ecdd22612a6a4`. No production, model, rig,
motion, comparison-workflow, threshold or baseline changes. Integration907 is
preserved. This is a verification candidate awaiting independent review.

## Actual CI failure

[Catalog job122020314288](https://github.com/rhgrive3/actions/actions/runs/40451016135/job/122020314288)
finished its native scenarios, then failed at05:23:34UTC:
`Catalog missing-module installed graph .../audio/pitch-preserving-charge-worker.mjs`.
The job reports479 modules and no network/page errors. This is separate from
the Explosher physical-delta capture comparison.

The installed graph requires this shipped module Worker. Its production owner
starts it lazily at Charger loadout/preparation, while the isolated motion
catalog imports audio with `audio.ctx === null` and never reaches that owner.
The existing helper explicitly exercises the generated render Worker and the
lazy grain/reverb Workers, but omitted the new charge Worker.

## Narrow correction

The catalog helper now runs the real module Worker's serial/key/transferred-PCM
protocol with a deterministic800-frame input at8000Hz and ratio.75. It compares
returned bytes to the canonical production export and always terminates the
Worker. The saved-result validator requires its exact immutable loaded-byte
receipt, protocol,600-frame/one-channel/2400-byte result and termination proof.
No missing-module exemption is added; existing graph requirements remain.

Four verification files change. The existing saved-worker test also covers this
third lazy Worker. The graph test's import/Worker/proof denominators increase
7→8,3→4 and2→3 respectively. Existing error controls remain, with additional
wrong serial/key, corrupt PCM, Worker-error and missing import/export controls.

## Focused evidence

- New regression against unchanged907 helper:0pass/1fail, explicitly missing
  the actually exercised charge Worker (`before.log.gz`).
- Candidate graph tests:16/16. Selected saved-worker receipt test:1/1. No skips.
- Real sandbox-enabled Chromium154.0.8037.57 against unchanged907 emitted assets:
  original coordinator loads46 hash-verified responses and no charge Worker;
  candidate loads47 and passes the strict saved protocol validator. The extra
  response is the real charge Worker. Returned2400 PCM bytes exactly equal the
  canonical export, and all Workers terminate. No AudioContext is initialized.
- No rebuild: all1493 committed source inputs and2199 emitted artifacts match
  unchanged907 content hash
  `af180bade0c09f1c0b32a8eab99016aa5f697991a32a7cd8ccb076cf3311ae84`.

`validation.json` records commands, log hashes and scope. `browser-probe.mjs`
and `browser-result.json` preserve the exact short Worker-only check, not a
motion-catalog replay, ordinary gameplay session or sound-output measurement.

## Still unresolved

The CI log also printed swim-turn-brake empty geometry/RGB diagnostics. Its
receipt validation stopped at the missing module before validating later gates;
the native presentation classification is not established by those diagnostic
rows alone. This candidate neither edits character/model behavior nor claims
the whole catalog will pass. It does not change the separate paint/SP equality
gate. No manual CI, metadata retry, new PR or merge is part of this handoff.
