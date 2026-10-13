# Ranked rule corrections after the Wiki audit

Reference: Splatoon 3 11.3.0. Reviewed S3-specific Wiki descriptions on 2026-10-12 UTC / 2026-10-13 JST. Implementation base: `ac1159b76b42a10ff02fe58add74a8285cc08d32`. The audit established real logic discrepancies on `b03d40b2`; later main changes did not repair these ranked modules. Nintendo hardware comparison remains unperformed.

## Sources and scope

- Nintendo basic objectives: https://www.nintendo.com/jp/bankara-king/index.html
- S3mix Clam Blitz: https://wikiwiki.jp/splatoon3mix/ガチアサリ
- S3mix Rainmaker: https://wikiwiki.jp/splatoon3mix/ガチホコバトル
- S3mix Tower Control: https://wikiwiki.jp/splatoon3mix/ガチヤグラ
- Tower recovery timing corroboration: https://wikiwiki.jp/splatoon3mix/バンカラマッチ指南/ガチヤグラ指南
- Inkipedia overtime and tied-possession notes: https://splatoonwiki.org/wiki/Overtime

The named S3mix rule pages determine admission and transition conditions. Numeric world geometry and trajectories remain the authored INKWAVE calibration described in `inkwave-ranked-research-2026-10-11.md`. A passing browser or isolated logic test is not a Nintendo-console measurement.

## Corrections and observable consequences

| Condition / reproduction | Before | Corrected behavior | Main implementation |
|---|---|---|---|
| Losing team has an active Clam scoring window but no spare Power Clam at time-up | Window lookup used the scoring team's target as its own defended basket; overtime could be omitted | Attack targets are indexed by attacking team consistently; the losing attack window qualifies | `runtime/ranked/clams.mjs` |
| Winning team has an attack window and loser has no Power Clam | Wrong basket lookup could grant overtime | Winning attack alone is not an opportunity; the documented previously-leading-defender exception uses ownership at opening | `runtime/ranked/clams.mjs` |
| Winning attack closes during admitted overtime while loser still has a Power Clam | Closing either window ended the game | Closing the losing attack ends its chance; closing the winner's attack permits a valid counterattack | `runtime/ranked/clams.mjs` |
| Carrier walks around an unbroken Rainmaker checkpoint toward the goal | Counts could fall to 10 before any checkpoint was passed | Pre-checkpoint count is bounded by authored checkpoint count geometry; passage is required to progress farther | `runtime/ranked/rainmaker.mjs` |
| Carrier is airborne on an ordinary route | Euclidean location alone improved count | Grounded contact is required; an explicit stage callback can authorize a documented exceptional route | `runtime/ranked/rainmaker.mjs` |
| Carrier steps behind the pickup point, before the fixed forbidden boundary | Timer remained at normal rate | Pickup location and prohibited boundary are both checked | `runtime/ranked/rainmaker.mjs` |
| Popped initial-center shield is left alone | Shield reformed after fifteen seconds | Central popped shield remains available; only popped noncentral shields run the fifteen-second return | `runtime/ranked/rainmaker.mjs` |
| Carrier times out in enemy territory or falls off the attacking side | Timeout always returned to center; falls used unsafe airborne coordinates | Enemy-side loss retains last grounded position; own-side fall/timeout resets to center; death/reset has a three-second reformation lock | `runtime/ranked/rainmaker.mjs` |
| Empty tower remains on a partly cleared checkpoint | Progress reset completely after three seconds | Progress pauses while on the marker, and recovers gradually only after leaving it | `runtime/ranked/tower.mjs` |
| Later team matches count and loses possession/chance | Equal counts remained equal | Explicit one-count rebound is applied at loss/close in Zones, Tower, Rainmaker and Clams; penalty basis does not change | `runtime/ranked/engine.mjs` plus mode transitions |
| Neutral clam spawn anchor remains occupied | Repeated groups overlapped | Only vacant authored spawn anchors admit new groups; the global cap and quick-spawn interval still apply | `runtime/ranked/clams.mjs` |
| Player catches a reachable airborne clam or activates a restrictive special | Grounded-only blanket gate; no special table | Geometry governs contact; S3-specific special pickup/throw gates are applied; deployment-only specials return throw permission after deployment | `runtime/ranked/clams.mjs`, `install.mjs` |
| Kraken activation, Reefslider impact or Triple Splashdown landing with inventory | Inventory was retained | All held small clams / Power Clam are ejected once per lifecycle event, with owner-authenticated monotonic counters in room ticks | `install.mjs`, `network.mjs`, `clams.mjs` |
| Power Clam lands on terrain or counter Power Clam appears | No objective paint | Native paint stamping is used with no special credit; followers use native paint replication | `clams.mjs`, `combat.mjs` |
| Power Clam hits a closed basket near time-up | Immediate opening/score | A consumed drilling clam precedes actual barrier break; it cannot qualify a new overtime by itself; a throw during admitted overtime may finish drilling before the twenty-second deadline | `clams.mjs`, `world.mjs` |
| Special-active actor picks up Rainmaker | Ordinary weapon was blocked, but existing special control could continue | Disallowed pickup specials are rejected; allowed actor-owned specials are interrupted with their gauge cleared and deployed objects preserved | `rainmaker.mjs`, `install.mjs`, `all-specials.mjs` |

## Limits kept explicit

S3mix and general Inkipedia differ on Rainmaker retreat rate (4x vs 3x), post-trigger overtime recapture (remaining fifteen-second S3mix window vs ten seconds after overtime), and Clam penalty rounding (half-count precision vs floor). This change keeps the existing S3-specific documented choices rather than claiming those disagreements are settled. No public ranked-rule raw dump or new console measurements was found to settle them.

The Wiki calls the basket drilling delay a little over one second. `1.2s` is a local approximation, with admission/score ordering tested separately from the numerical value. The approximately three-second tower recovery is interpolated linearly; its curve is not extracted retail data. Rainmaker count geography, forbidden boundaries, clam scatter, paint radius, throw inertia and all map layouts remain local world calibration. Exceptional airborne Rainmaker count regions are supported by an explicit callback but none is invented for the authored stages. Tower-mounted deployable attachment and special lifetime modifiers remain outside this correction and require their own native-world comparison; the four modes are not claimed to be exact retail stage reproductions.

## Verification

`ranked-wiki-rules.test.mjs` supplies source-derived game-state scenarios, three interval sizes, overtime/drilling boundaries, spawn occupancy, special restrictions, ties, restoration and malicious new snapshot fields. Existing tests that assumed immediate opening, incorrect basket ownership, grounded-only pickup or stationary-checkpoint reset were corrected to the described game conditions. `ranked-integration.test.mjs` exercises native special activation, host frame production, native objective effects and special interruption. The full ranked suite retains the actual Actor/Physics/Projectiles/Paint BOT scenarios. CI performs four local offline modes, four real two-client relay modes with 200ms delay, and after main publication four offline modes at the actual public URL with exact build identity matching.

Final test counts and CI evidence are recorded in the pull request. Browser results are retained as CI artifacts. Numerical rule disagreements and console comparison are not marked resolved by those tests.

## Follow-up: Rainmaker weapon attack (2026-10-13)

The dedicated weapon was already present; this follow-up corrects behavior at the native input/effect boundaries rather than treating the existence of a projectile as retail parity.

| Condition | Previous behavior | Correction / evidence |
|---|---|---|
| Start charging, release, then hold again | Immediate charge and immediate release; no recovery | Wiki's human 1F / squid 6F pre-charge, 1F pre-shot and 20F recovery; residual elapsed time crosses phase boundaries, pending release survives snapshot restore |
| Exact 60F charge at 60Hz | Floating-point accumulation could miss the full threshold | Epsilon snap; 60Hz, 20Hz and 5Hz tests all reach full charge and preserve recovery |
| Transform to squid while holding a charge | Charge could be retained/released | Charge is discarded; next emergence has the squid pre-charge delay |
| Pickup during an ordinary main-weapon charge/stream | The suspended runner could remain busy, forbid swimming and resume after losing the objective | Reset the owned main runner once on entry; a real charged Charger pickup can transform to squid and cannot resume the old shot |
| Native carrier presses fire | Fire input was stripped before native form arbitration | Actor receives fire for emergence/pose; the installed WeaponRunner boundary still prevents the ordinary main weapon from emitting |
| Charging/firing movement | Only ordinary kit speed ×0.8 | Dedicated 0.6 DU/F movement converted through the host's world scale, with firing gear modifier |
| Full charge cue | No dedicated full-charge sound/glow | One `rainmaker-charged` event, native `charger_full` sound and objective emissive cue |
| Dedicated projectile travels | Charge-dependent range was emitted but ignored; no falling-ink trail | Charge-dependent horizontal reach, native table's launch-Y component, first surface below flight painted, charge-dependent recoil |
| Partial shot lands | No splash damage, but bomb ring/audio still played | Direct damage and impact ink only; no explosion FX |
| Full shot lands / directly hits a body | Immediate blast; band distance measured to feet | Direct 60 first, then armed ground shot; 180 / 40 blast bands use the same body center as projectile collision; native wall LOS remains required |
| Defense contact precedes a body | Dedicated projectile skipped the installed defense lane | Native `kitDefenseCandidate` participates in nearest-contact arbitration; shield contacts and Crab Tank contact skip the ground fuse |
| Ultra Stamp / water / Ink Vac | Could produce a terminal explosion | Stamp and water remove the projectile without explosion; the native intake can absorb flight and the armed ground shot before detonation |
| Objective ink / pickup | Dedicated ink lacked an explicit no-special claim; no explicit pickup tank refill | Shot/trail paint uses `claimMode: no-special`; pickup refills the native ink tank; shield pop keeps ordinary last-attacker paint ownership rather than inheriting the carrier shot restriction |

Weapon sources: the Rainmaker shot section of S3mix listed above, the S3mix Ink Vac page (https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/キューインキ), and pinned Leanny 11.3.0 `WeaponSpGachihoko.game__GameParameterTable.json`. Spawn speeds, launch-Y, recoil control values and ink radii come from that table. The recoil impulse conversion, gravity `60 world units/s²`, horizontal reach cap and impact fuse `0.2s` are explicit local adapter choices; neither cited source exposes the complete native trajectory or a precise fuse. The raw `PaintRadius=5` converts to one world unit, not a five-world-unit stamp. Falling ink uses ray-projected stamps, not an extracted retail droplet simulation. No Switch hardware trace or exact explosion delay is claimed. Shield HP blast multipliers and native canopy/network geometry and survival of a previously launched canopy across main-runner replacement remain comparison items; the first-contact lane does not establish all defensive-object parity.

The follow-up adds elapsed-time attack tests, direct-versus-delayed damage, partial impact FX, reach/paint, water, defense ordering, follower authority/recoil and an installed Ultra Stamp guard test. The browser gate now drives the real carrier's `Actor.update` and `Match.advanceRanked`, verifies full charge, one release, no recharge during recovery, actual 60 then 180 damage, a real target splat, no ink cost and no carrier special gain. It advances the real target actor on the next fixed tick, preserving the native delayed lethal scheduler. The online gate also drives guest-owned Input → PlayerController → rki → host charge/release → rkevent → follower visual replay through the delayed production relay, using a controlled carrier snapshot. Browser simulation is recorded separately from the isolated fixture and from unmeasured console parity.

## Follow-up: Rainmaker Splash Wall and native object ownership

The S3mix Splash Wall damage-rate table specifies Rainmaker direct x1 and weapon blast x2 (Object Shredder applies its separate wall x1.5 once). The previous ranked effect emitted direct contact but did not send the weapon blast through the native deployed-object HP path. Its host-only callback also mismatched the ordinary shooter-to-object-owner proposal path for a guest carrier.

Dedicated shots now use the shared native object-hit mutator for wall blast bands: direct 60, near blast 180 x2, far blast 40 x2. Wall rectangle geometry is the existing authored native geometry. A snapshot of that plane blocks the same explosion behind it even if the direct/blast removes its HP; the break-frame ordering is a local consistency decision, not a new Switch measurement. Terrain LOS still applies. Carrier actor damage and paint remain host-owned; the locally owned projectile actor, including a guest's visual-only replay, owns native defense HP/proposals. A host proxy does not spend those HP again.

Five actual installed-runtime tests cover full wall damage, Object Shredder once, behind/front shielding, destruction, guest owner proposals and duplicate rejection, and host-proxy nonmutation. The browser's actual Actor input attack now also checks an installed wall changes 800 to 380. CI evidence is pending at preparation; no success is claimed yet. Other defensive-object blast rows, full canopy geometry, exact retail trajectory and hardware comparison remain comparison items.

The follow-up is rebased on main ee9fbbab, preserving the concurrent source parity and special-control changes. Native object damage now carries raw 60/180 and authored Gachihoko_Bullet/Gachihoko_BombCore causes; the existing pinned object-rate consumer applies x1/x2 and gear once. The delayed browser gate seeds paired native deployed walls, drives real guest input and verifies native owner deliveries spend exactly 60 then 360 HP through the 200ms production relay. Natural wall HP decay is preserved and measured separately from each synchronous delivery. Controlled geometry does not establish native deployment/ink-payment wire fidelity. CI remains pending.
