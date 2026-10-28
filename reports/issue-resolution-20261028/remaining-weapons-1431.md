# #1431: hit-pose display connection and cover

Baseline: `60bbe35d4c5176fd86cb1b65f8e66336982ef6ca`. Target: production-composed `inkwave-public` plus active patches. No gameplay scalar or original Nintendo animation/physics formula is changed.

The existing `catalog-pose-birth.mjs` connector validated emission and resolved display through the same `Character.getMuzzle/getMuzzleHand` methods. Those getters intentionally return the unmodified gameplay muzzle during native hit reactions. The actual weapon mesh has a different displayed transform. Consequently the deferred flash and drawn birth history still attached to an invisible base-pose socket.

The new regression fails on the old runtime at the first Quad right-hand, down-45-degree birth: its deferred FX equals the gameplay getter and misses the displayed mesh by approximately 0.02916 WU. The complete corrected matrix has 27 conditions: Quad starting on either hand and Explosher, pitches -45/0/+40, and 30/60/120 Hz render schedules over the real fixed clock. It observes 270 accepted births. The former gameplay/display separation reaches 0.03184 WU for Quad and 0.28489 WU for Explosher in this deliberately repeated-hit fixture.

Emission validation still reads the gameplay getters. Resolution now reads the actual displayed `weapon.muzzle` or `weapon.left.muzzle` world position. The same existing maximum connection distance and same-tick/seed guards apply. Head positions, start/previous positions, launch velocity, damage, ink, random values, serializer output and authoritative paint are equal to the same live runtime with its optional presentation connection disabled.

The cover check also used `Physics.los`, which intentionally omits its final 0.05 WU. A real solid OBB at z=0.18..0.19 on a connection ending at z=0.20 is invisible to that shortened query. Resolution now uses the full segment with the established grate transparency. The regression proves the old LOS is clear, the full segment hits the solid, the connection remains at its physical origin, and a grate permits the displayed connection. No authoritative projectile collision owner changes.

Verification (Node 22.23.4): the new three tests, existing four pose-birth tests, source-loaded authored Explosher test and actual native-volume connection test pass **9/9**, with no failures or skips. The existing source-fixture tests emit their optional-motion dynamic-import warning; the source-loaded fixture separately awaits the real bank. CPU matrix/FX/serializer checks are not WebGL image or console acceptance. Logs and the before failure are preserved in `remaining-weapons-logs/`; per-condition metrics are in `remaining-weapons-1431-hit-pose.json`.

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/issue-1431-hit-pose-birth.test.mjs patches/splatoon3/tests/issue-1431-catalog-pose-birth.test.mjs patches/splatoon3/tests/issue-1431-explosher-authored-muzzle.test.mjs patches/splatoon3/tests/issue-1431-volume-pose-connection.test.mjs
```

The user subsequently removed hardware verification from acceptance (「実機検証はいりません」). The local first/steady origin, aim/fallback, display and authority conditions are implemented and source-verified; collective emitted/hosted integration is the remaining execution gate. Authentic retail aperture/pose equality is a provenance limit, not an additional completion requirement. The existing authored Explosher lip and intentional physical birth/prediction/LOS policy remain in force. No Nintendo physical-origin certification is claimed.
