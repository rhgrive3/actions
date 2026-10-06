# Fixed UI batch: live Turf lead / final-minute music

## Scope

Two roots, three Issues: #99 with duplicate #748 (qualitative live Turf lead/Danger), and #742 (remove extra bar wait at the final-minute BGM event). No other root is added.

Current baseline after PR764 merge: public main `a3993f37a00cc2f0a7b01d954591b98fb6ae97e3`, tree `4208878bafbc52e698eb608f197f6ef0fa700f87`; local base `292b1760f193162e894a13a3f2040b5cfa49541c` is tree-identical. The initial Draft used main671e3ded; its failed CI evidence is retained below. The latest open PR #781 contains kit/residual gameplay files, not either UI root. Earlier open-PR actual-diff checks and primary claims are recorded in the focused reports.

The existing main UI corrections (#715/#718/#720 and lifecycle cleanup) are retained. Composition only combines the two quality registrations and appends both reports. The Main music hook and Match/HUD presentation hooks do not replace one another.

## Local composition evidence

- Focused actual composed source: 24/24 (15 Turf including verifier/fixture checks, 9 music).
- Actual emitted modules from one combined authentic build: 22/22.
- Local-quality plus idle-resource gates: 177 total, 175 passed, zero failures, two existing optional skips (Tenacity emitted path and forced-GC collection).
- Combined build: `4324b94cffa4c673f7a51fea0e7fc6d0efa4cc5c5afe7e73896baf3f2b7aa990`, 145 preloads.
- Standalone minified coverage: 15/15 Turf and 9/9 music. Production hashes are unchanged from those focused candidates.

## Pending browser acceptance

The existing active-game browser runner now captures eight controlled Turf presentation PNGs (both viewer teams, 1280/375 widths, ahead/behind), with below/tie/finish clearing and Range combat-bar suppression checks. The serialized inspector rejects hidden/zero-opacity ancestors or Danger labels; it checks bounds and separation from the timer/self-arrow. Failure phase/rows and PNG are preserved before restoring the controlled scene. Negative controls reproduce the previous verifier's hidden-HUD false pass and confirm rejection after the correction.

These are prepared assertions, not completed browser results. Local Chromium's previously established EPERM restriction remains; no bypass is used. Exact source/content receipt and visual inspection of the new PNGs are required from this Draft's CI. The small viewport does not prove physical mobile hardware behavior. Final-minute evidence concerns WebAudio scheduling, not physical listening, Switch timing or real network audio synchronization.

See [Turf scope and limits](inkwave-live-turf-lead-99-748.md) and [music scope and limits](inkwave-final-minute-music-742.md). The 10-point Turf threshold is supported by the cited competition account; 1.08 emphasis remains a local layout choice, not a measured Nintendo pixel ratio.


## First CI: frozen intro fixture correction

Run `37397568473`, merge source `5b5394c3b4c69a32f86f1797884fb05001a9ef7d`, confirmed the expected combined content. Active job `112057077563` failed the new visibility guard before its first lead screenshot. Artifact `11383967091` (ZIP SHA256 `3acf6d506b6be7296fe5c1f0b543f7ff6ef49990eaf28bf0780f5eb01cbd5a05`) preserved the controlled failure: the world renders, but the entire HUD is hidden. It is a failed acceptance result, not a successful screenshot.

The preexisting active fixture freezes rAF and immediately advances 270 simulation ticks out of intro. The native HUD reveal is a 3000 ms wall-clock callback guarded by the same Match's intro state, so that callback correctly does nothing after the fixture has already reached playing. The corrected runner waits for the existing same-Match intro reveal and settled visible opacity before fast-forwarding. It never forces HUD visibility, shortens the native timer or relaxes the visibility assertions. Existing intro lifetime regressions exercise both timer-before-state-change and state-change-before-timer controls. This verifier-only correction does not change production or the combined content hash. New browser acceptance remains pending the corrected CI.


The same run's UI job `112057077539` passed touch layout (6 engine/viewport cases) and reliability (52 checks), then failed its existing dirty-source identity negative control. That isolated fixture copies the browser entry script without presentation helper modules. The new static helper import therefore failed before the intended dirty-overlay rejection. Loading the presentation helper only after the exact-source gate preserves the original strict identity assertion and avoids requiring browser-only code for a deliberately rejected checkout. A focused source contract checks this ordering; no identity, storage or visibility gate is weakened.


### New-main composition after the first CI

Only the already-merged PR764 input-policy delta was inherited before the corrected CI. Main764 plus both UI roots passes 60 focused source checks including the existing intro lifetime and relevant gyro/pad boundaries; quality is 175 passed with two existing optional skips. The one rebuilt combined site passes the 24 UI emitted checks and the existing input-policy emitted composite case. The UI production adapter bytes are unchanged; the new content hash reflects the inherited main runtime. No source PR or extra root was added.

## Fixed PR766 stack for final merge order

The parent fixed the merge order to PR766 then this UI batch. PR766 is pinned to public `213d0b6ce8b17755cba6ed16ddf6b5ee8abea985`, tree `b5a419cbb70bc34f76751eed5649c4a06af814c9`, local equivalent `470a3fd4100c5c9fc6e118a5fefecdde8e197200`. Its three-file #723 bomb-contact correction is an inherited base dependency, not an added UI root or a duplicate claim. The UI delta against that fixed tree remains 11 files.

The final stack passes 35 focused source and 35 authentic emitted checks (24 UI/verifier plus 11 inherited bomb-contact cases) with content `b4ef7460511ef30ea7f3e6a8d48cc8c4456f7b5c864beced2a95d73bf2e5180e`, 145 preloads. Earlier source/input-policy and quality evidence is retained above; the final stacked source still requires its own CI receipt.

The corrected a399-based run `37399241288` completed all seven jobs successfully. Its UI and active receipts both bind merge source `a80a5032c8de681e73b61e9639c79ed960bf8f71` to content `4324b94cffa4c673f7a51fea0e7fc6d0efa4cc5c5afe7e73896baf3f2b7aa990`. The newly added active-game probe passed, including its eight PNG capture calls. The official artifact `11385201545` ZIP digest is `2ea3916f08a7b54f07519577e93a6043e066f05fbf22512f61cc250aa8c982c7`.

Manual PNG inspection from that run is **not complete**: the official artifact tool returned a download reference, but reading that temporary delivery URL returned HTTP 403 (`error code: 1010`) while its signature was still valid. A metadata/body check confirmed the same refusal. No alternate host, credential, user-agent change, or other access-control bypass was attempted. The URL is not recorded here. Successful computed-style assertions are not substituted for manual visual acceptance. The final stack's independent CI artifacts must be inspected through a working permitted route before claiming the visual gate.
