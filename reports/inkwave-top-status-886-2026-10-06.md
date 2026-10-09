# #886: qualitative top squad status for both teams

Claim: https://github.com/rhgrive3/actions/issues/886#issuecomment-6024870197
Base: PR868c401198ccac3dc127e7581b517f91d60db24423d. Main remainsf31f5da439134fe49bb89018dad5557671a49c67.
Fresh Issue comments were empty and the PR search found no #886 implementation before the claim. Existing #112 was explicitly enemy-only: allies still carried and displayed exact seconds. The current #868 source confirmed the residual.

The top squad snapshot now carries null for every dead player's respawn value and does not read their authoritative timer. The HUD omits the numeric text and timer ring for both sides, including legacy/raw summaries. Its cache retains the original field layout for alive/special/self/weapon state while replacing the time component with zero. Pooled player identities, viewer order, lead/Danger values, alive/dead/empty classes, ready glow and self marker retain their owners.

Actor respawn clocks, gear modifiers, the local player's dedicated respawn countdown, the separate pause-roster policy and Turf Map #718 are not changed. In particular, #112's pause-roster teammate timer remains its separate existing behavior. This implements #886's top-bar information boundary and makes no new claim about pixel-matching Nintendo's HUD or disconnected-player transport.

Verification: three pre-fix regressions reproduced the allied numeric exposure (both viewer teams) and the top snapshot's timer read. The final actual-module suite passes10/10: both views, forged legacy summary, roster/viewer pool reuse, online/offline snapshot boundary, local countdown, and existing #112/#300/clock cases. The local countdown test executes the real composed showSplatted method with sampleRespawnCountdown; its initial missing querySelector test scaffold was corrected without any production change to that owner. JavaScript syntax checks pass. No new full build, browser run, CI, branch update or main merge was performed by this change.
