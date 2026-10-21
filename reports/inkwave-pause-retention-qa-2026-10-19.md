# Offline pause retained-frame comparison

This QA-only successor to [PR1660](https://github.com/rhgrive3/actions/pull/1660) addresses its baseline admission failure without changing the retained-frame runtime. Base candidate: a3d71d9d9de2bd9e36806bdd336d46e66c938046. The owner has already corrected the obsolete HUD expectation in this head; its entire baseline and candidate assertion blocks are preserved. The unchanged comparison baseline is fixed main00b8994711809ba6d0469723c858ddef6805e2ae.

[Actual job118041922376](https://github.com/rhgrive3/actions/actions/runs/39247207695/job/118041922376) measured a fully paused baseline HUD/world with no retained frame, no GL error, and nine black GL samples after compositor turns. Its subsequent HUD120 assertion was obsolete: the baseline already contains the HUD pause optimization. The candidate browser stage was never reached. This result neither proves nor disproves candidate rendering.

The baseline checkout SHA and its existing HUD-owner build/input hashes are now required. It must keep HUD/world work at zero and reproduce the black-buffer negative. Candidate assertions remain: zero repeated full renders,120 lightweight presentations, no recaptures, nonblack GL samples, frozen state/HUD and release on resume.

A separate observation retains the original synchronous120-frame gate and adds120 distinct requestAnimationFrame callbacks. Each callback invokes one paused frame, records timestamp/delta and visibility, checks submitted work counts, samples the GL buffer and records state/HUD/texture lifetime. Capture exceptions and context termination remain failures with a saved receipt. The final original PNG is still captured. Callback GL observations support continuity across browser turns; they are not direct compositor scanout or physical-device proof.

Local contract tests6/6 pass, including wrong baseline/owner, retention contamination, black candidate, live world, repeated timestamps, hidden page, GL/context error, state/HUD drift and partial-capture failure. Original candidate runtime and assertions, deadlines and retry policy are preserved. Actual desktop/mobile candidate capture and full exact-head CI remain pending.

This concerns browser lifecycle behavior, not a new Splatoon3 movement/weapon number. No original-game device equivalence is claimed.
