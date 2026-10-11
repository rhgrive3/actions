# Sub Resistance Up marking duration — 11.3.0

## Source and scope

Pinned source: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json

The exact raw file is retained as `patches/splatoon3/reference/gear-params-1130.json`, SHA-256 `7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e`. Source arrays are `[high, mid, low]`: `MarkingTimeRt=[.1,.43,1]`, `MarkingTimeRt_Trap=[.1,.55,1]`. Runtime arrays reverse that order and use the existing AP conversion (10 main, 3 sub, 0..57 cap) and gear curve. This fixes Point Sensor, Angle Shooter and Ink Mine marking only. It does not change their damage, throw physics, paint, detection geometry or special recon effects.

## Reproduction and correction

At baseline main `a5b7d86e67ed25e3cc711534e1240df2bd20a4ce`, actual installed Actors with 57 AP still received eight-second Point Sensor and five-second Angle Shooter/Ink Mine marks from zero-AP attackers. The new source comparison had three zero-AP passes and eight nonzero-AP failures. The candidate derives two victim-local coefficients and applies them once at contact: 57 AP becomes .8 seconds and .5 seconds, respectively.

Projectile-owner Sub Power still determines raw source duration. Wire frames remain unscaled, and receiving peers apply their own victim's derived resistance once. No arbitrary multiplier is added to packets. Contact samples the current equipment; changing equipment does not retroactively modify an existing deadline. Existing maximum-deadline overlap/extension is retained. Exact Nintendo integer-frame rounding, equipment-change rules and transport-age correction are not established by this patch; the unchanged continuous timer and receipt-time convention are explicitly retained.

Actual JSON tests exposed a second defect: Angle Shooter and Ink Mine mark payloads omitted `life`, so their existing replay guard rejected every mark. Senders now include the current authoritative owner life while preserving the original projectile source life. Replay retains owner/life/target-life guards and additionally requires a known matching projectile birth, matching sub kind and original AP-derived raw frames. Unknown birth, altered source life, substituted sub and altered duration are rejected. This remains client-authoritative contact evidence, not server-attested collision truth.

## Verification

- Expanded source tests: 33/33 passed. Victim AP 0/3/10/30/57; three actual projectile lanes; attacker AP 0/57 × victim AP 0/10/57 through real NetMatch JSON event replay; no double reduction; duplicate and foreign sender rejection; death/respawn and old-life rejection; preserved overlapping deadlines and equipment changes; source-birth/duration admission.
- Earlier broad sub/support/Sub Resistance regression: 51/51 passed; that run contained the initial 22 marking cases, before the expanded 33-case matrix.
- Earlier production build: 22/22 passed; updated expanded built and full gates remain pending.
- Exact extracted browser probe: 2/2 passed (new nine contact/AP checks plus unchanged transient probe). Actual Chromium/WebKit execution remains pending PR CI.

The browser probe uses real Actor, Projectiles and Physics with a controlled empty world and display stub. Projectile positions are selected to exercise contact; it does not establish retail trajectory or character rendering fidelity.

## Delayed marks and bounded birth evidence

Receiver visual ghosts can expire or be intercepted before a legitimate owner mark arrives. Accepted birth evidence is therefore kept independently of the visual object. Evidence is keyed by Actor identity, owner identity, network object, current match and NetMatch. Owner-authored ordered expire/destroy removes it; local visual retirement does not. WebSocket transport and the existing monotonic event admission preserve source mark-before-expire ordering. An old mark after a wire terminal event is rejected, not treated as valid latency.

Each owner has at most 96 unretired birth records, matching the source catalogue's 96 simultaneously live object limit. Ordered owner terminal messages remove short-lived records, so 110 sequential short-lived births do not evict a long-lived Mine. Other owners cannot consume this bound. A monotonic source-life/sequence high-water prevents a fresh envelope from reviving an evicted birth. The existing billion-event sequence wrap is fail-closed for marking and is not claimed to support indefinite matches. Records are discarded on projectile clear, match/NetMatch replacement or Actor/owner/network identity replacement. No guessed network latency timeout is imposed on a valid indefinitely deployed Mine.

Additional actual runtime regressions cover receiver visual interception and 100ms advancement; same-tick JSON mark then wire expiry; terminal-before-mark rejection; source-cap eviction and re-envelope replay; 150 births from another owner; same-owner 110 retired births; leave/rejoin; and a source-life-0 Mine marking after its owner respawns into life 1 via an actual accepted snapshot. This is bounded client-authoritative birth validation, not a proof of retail collision timing.

The revised receipt candidate is being validated separately from the frozen initial dc143cd full-source diagnostic run. Final revised build, full gates and actual browser CI are pending.

Identity follow-up: an observed mismatch now deletes the obsolete state, rather than merely returning no match. The old implementation reproducibly admitted a mark after an Actor changed authority and returned to its old owner ID. A new regression covers owner, match, NetMatch and Actor.net replacement followed by restoration; it fails against the previous built candidate and passes after invalidation. Forged new events by the current authoritative client remain outside server-attested guarantees.

## Three-peer display connection

A further actual three-peer regression found that Angle Shooter and Ink Mine wrote the victim owner's mark but rejected remote targets on both the attacking and observing clients. The team-scoped map/world UI reads revealedUntil directly; no separate reveal snapshot supplied those missing views. The candidate removes that remote-display rejection while retaining team, life, known-birth and duration admission. Point Sensor already used the same display-side model.

The new test first sends the victim's real accepted gg equipment snapshot to the source and third peer, then emits the actual projectile marking event through JSON. AP0 and AP57 produce the same five-second / half-second mark across all three views. Only the marking team passes revealedTo; the victim team, invalid teams and null viewers do not gain a mark. Equipment changes preserve admitted deadlines; ordered death/respawn playback clears every view, and an old-life mark in a new envelope cannot revive it. This does not grant a remote Actor gameplay simulation or change damage authority.

## Test-worker memory isolation
The frozen ff42e645 aggregate source run reported 4787 pass, 19 skip, and one worker failure: sub-mark-resistance.test.mjs exited by SIGKILL, with no assertion failure or kernel OOM evidence. The identical 41-case worker passed alone; measured child peak RSS was 2,170,844 KiB. Its unchanged assertions were separated into local/source, JSON matrix, and lifecycle files sharing the same fixture helper. Separate measured peak RSS was 562,456 / 1,081,972 / 1,152,400 KiB, all successful. This lowers the largest measured worker peak by about 47%; it is evidence of reduced fixture memory pressure, not proof of the original kill cause. The split 41 source cases and 46 production-built mark/browser/observer cases pass. Final aggregate validation is recorded separately after completion.

## Final latest-main gates
Base official main d1ad48d1c10b5ded6a4fe273fe953e49e8bd7b04. Both the unsplit observer revision d1ed700 and the final split revision 1ee41be completed the full source gate with 4,856 tests: 4,837 pass, 19 optional skips, zero failures. The split run took 1,826.1 seconds. Network: 448/448. Production-built mark/browser/observer checks: 46/46, content hash 91d4ec5257ff8c5b33dde9885d92f3f82dbd1b28077d6ad11ed337468a07596c. A separate local composition with direct-sub PR1253 passes 77/77 actual-built checks, preserving both browser probes and all four resistance coefficients. Published exact-head browser/CI remains pending for this marking candidate. The earlier SIGKILL record remains part of the diagnostic history rather than being relabeled a pass.

## PR1246 main integration

Old published marking head `2a78bf130763221cd5193749bf3239fc5e178264` passed Validate38175441438, numerical38175441483 and reopened38175441454, including all Chromium/WebKit browser checks.

New main `062c4a81f5a989406d3d65f5803ee074bd9cc0d4` adds weapon model/motion runtime. All 63 changed textual blobs were fetched at that fixed SHA and verified byte-identical. The 267 report-only PNG/JPG blobs were not downloaded for local testing; publication preserves their official remote blob SHAs. Local test checkout is therefore a text-equivalent production baseline, not a complete official tree replica.

Composed production build `1805143e8e6ee85e406cd80aa74e18b15a5739f7e301b43c220532737f1b66aa`: supported marking/direct/model-registry/catalog/muzzle suite 90/90. The two family-internal motion tests passed 2/2 on source. Running those source-only tests as built initially failed ENOENT because production bundles family modules into registry; no runtime files were copied into the build to conceal that contract difference. The separate actual-built registry checks cover all65 models and actual Actor/Runner/Character carry/attack. New-head hosted CI remains required.
