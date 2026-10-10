# Complete Splatoon 3 sub/special catalogue: source and calibration record

Reference profile: Splatoon 3 Ver. 11.3.0. The selectable 14-sub / 19-special catalogue is declared in [`runtime/catalogue.mjs`](../patches/splatoon3/runtime/catalogue.mjs). Parameter data came from Leanny's extracted 11.3.0 tables, pinned at commit [`7280ff9cde8bb1c5dcef46c700c326471584d2e6`](https://github.com/Leanny/splat3/commit/7280ff9cde8bb1c5dcef46c700c326471584d2e6). Per-file SHA256s, the 11.3.0 weapon-info checksum, archive checksum, and the four inspected weapon rows are recorded in [`catalogue-1130-receipt.json`](catalogue-1130-receipt.json). The archive copy was supplied from the [Drive source folder](https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b); its local SHA256 is `1a4fe5b48f47de60426a474034cf3e2aa61acf5f7eaf4b947a9e502e7d52ef66`.

The table root for all 33 parameter JSONs is `splat3/data/parameter/1130/weapon/`; append the listed basename and `.game__GameParameterTable.json`. Receipt paths are relative to the extracted archive root. These are extracted game parameters, not a Nintendo-published spec. Nintendo's [official update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/~/how-to-update-splatoon-3) independently records the relevant recent special-point changes.

## Four additional base-kit gauge costs

The 11.3.0 `splat3/data/mush/1130/WeaponInfoMain.json` rows match the values in the base-kit catalogue. Nintendo's 11.1.0 notes record Blaster 180→190 and Splat Dualies 190→200; its 11.2.0 notes record Slosher 210→220. The 11.3.0 point-cost delta list changes three other weapons only. Barrel Splatling's 210 is confirmed by its current extracted row; it is not the Heavy Splatling row that Nintendo changed in 11.1.0.

| Main row | Weapon | Sub / special from source row | 11.3.0 cost | Check |
|---|---|---|---:|---|
| `Maneuver_Normal_00` | Splat Dualies | Suction Bomb / Crab Tank | 200 | Matches Nintendo 11.1.0 (190→200); no 11.3.0 change. |
| `Blaster_Middle_00` | Blaster (Hot Blaster) | Autobomb / Big Bubbler | 190 | Matches Nintendo 11.1.0 (180→190); no 11.3.0 change. |
| `Spinner_Standard_00` | Barrel Splatling | Sprinkler / Wave Breaker | 210 | Current extracted row is 210; do not substitute Heavy Splatling's separate 11.1.0 change. |
| `Slosher_Strong_00` | Slosher (Bucket Slosher) | Splat Bomb / Triple Inkstrike | 220 | Matches Nintendo 11.2.0 (210→220); no 11.3.0 change. |

Official history references: [11.1.0 and 11.2.0 tables](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/~/how-to-update-splatoon-3) (11.1.0 rows list Blaster and Splat Dualies; 11.2.0 lists Slosher); [11.3.0 cost deltas](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/~/how-to-update-splatoon-3) (FRZ-N Splattershot Pro, Custom Hydra Splatling and Inkline Tri-Stringer only).

## Parameter inventory

All files below are separately hashed in the receipt. The currently registered behavior is split among `runtime/all-subs.mjs`, `runtime/all-specials.mjs`, `runtime/support-recon.mjs`, `runtime/support-cooler.mjs`, `runtime/sub-special-fidelity.mjs`, and the existing native projectile/special adapters. `runtime/catalogue.mjs` contains the user-facing selection and base-kit registry.

### Sub weapons (14)

| Catalogue ID | Name | 11.3.0 source table | Parameter evidence / remaining calibration |
|---|---|---|---|
| `bomb` | Splat Bomb | `WeaponBombSplash` | Source damage is 180/30 at 3.6/7.0; burst frame 60 and recovery stop 60F. Its 70% ink cost is a public gameplay value (no explicit `InkConsume` field in this table). INKWAVE throw, collision/ricochet and paint mapping still need live comparison. |
| `suction` | Suction Bomb | `WeaponBombSuction` | Damage is 180/30 at 4.6/8.0; recovery stop 60F. The public gameplay cost is 70%; the table lacks an explicit `InkConsume` field. Attachment surfaces, world-scale timing and explosion collision still need comparison. |
| `curling` | Curling Bomb | `WeaponBombCurling` | Min/max charged blast is 180/30 at 1.6/5.0 and 4.6/8.0; direct hit 20; max charge 60F, ink cost 65%, recovery 70F (30F at max charge). Slide-path, rebound and terrain-following remain geometry-dependent. |
| `burst` | Burst Bomb | `WeaponBombQuick` | Ink cost 45%, recovery stop 60F, damage 35/25 at 2.8/4.0, paint radius 4.0. Fuse/gravity/world conversion and the direct-hit approximation need comparison. |
| `autobomb` | Autobomb | `WeaponBombRobot` | Ink cost 55%, damage 180/30 at 2.85/6.5, chase 150F and no-target wait 180F. Target acquisition, world mapping and paint distribution need comparison. |
| `fizzy` | Fizzy Bomb | `WeaponBombFizzy` | Ink cost 60%, charge thresholds 40/80F; three blasts deal 50/35 at radii 1.6/3.8, 1.95/4.5 and 2.6/5.45, with paint radii 3.0/3.4/3.8. Bouncing flight and hop cadence need comparison. |
| `torpedo` | Torpedo | `WeaponBombTorpedo` | Ink cost 65%, damage 60/35 at 2.6/6.0, splash hit 12 at 2.6, burst 30F. Homing target choice and world mapping need comparison. |
| `inkMine` | Ink Mine | `WeaponTrap` | Ink cost 60%; trigger radius tiers 3/3.5/4, separate mark-area distance tiers 8/9.5/11, durations 300/450/600F, max 2 placements; blast 45/35 at 3.6/8.0 and paint radius 5.0. Arming and actor-to-field collision need comparison. |
| `toxicMist` | Toxic Mist | `WeaponPoisonMist` | Ink cost 55%, recovery stop 80F, area cutoff 5.4 and effect-level frames 60/30/15. Cloud lifetime, slow/ink drain and world scale need comparison. |
| `angleShooter` | Angle Shooter | `WeaponLineMarker` | Ink cost 40%, recovery stop 50F, direct damage 40, mark tiers 300/450/600F, zero-damage tail 90F, projectile paint radius 2.6 (impact paint radius 2.0), collision radius 0.25. Bounce/rebound mapping needs comparison. |
| `splashWall` | Splash Wall | `WeaponShield` | Ink cost 60%, recovery stop 85F, source max-HP tiers 800/1150/1500 after ×10 conversion and damage span 30F. Wall dimensions, lifetime, incoming-shot admission and world mapping need comparison. |
| `sprinkler` | Sprinkler | `WeaponSprinkler` | Ink cost 60%, recovery stop 60F; hit-paint radius 2.9, spout draw radius 0.25; first/second period tiers 480/630/780F and 900/960/1020F. Droplet pattern, lifetime/HP and world mapping need comparison. |
| `beakon` | Squid Beakon | `WeaponBeacon` | Ink cost 75%, no recovery stop while placed; throw/knockback rows are extracted. Placement lifecycle, jump uses, HP and world mapping need comparison. |
| `pointSensor` | Point Sensor | `WeaponPointSensor` | Source includes area-distance tiers 6/6/6, mark durations 480/720/960F, launch-speed tiers, 45% ink and 75F recovery stop. INKWAVE field collision, flight and radius scale remain provisional. |

### Special weapons (19)

| Catalogue ID | Name | 11.3.0 source table | Known source/calibration boundary |
|---|---|---|---|
| `trizooka` | Trizooka | `WeaponSpUltraShot` | Direct hit 220; splash 53/35 at 2.5/4.0; shot delay/start delays 15/5F. Aim and projectile flight/hit-volume mapping need comparison. |
| `bubbler` | Big Bubbler | `WeaponSpGreatBarrier` | Barrier radii 2.255–7.5 and deployment/drone frame rows are present. Placement and shield-vs-device damage admission need comparison. |
| `zipcaster` | Zipcaster | `WeaponSpSuperHook` | Special duration 540F; hook blast 45/35 at 5.25/6.0. Tether attachment, pull/release movement and collision mapping need comparison. |
| `tentaMissiles` | Tenta Missiles | `WeaponSpMultiMissile` | Blast 150/50/30 at 1.1/2.1/4.25, paint radius 3.0. Lock selection/window and warhead travel remain calibrated. |
| `inkjet` | Inkjet | `WeaponSpJetpack` | Blast 50/30 at 2.55/5.0, paint radius 3.2; published gameplay table says 120 direct. Flight control and world mapping need comparison. |
| `storm` | Ink Storm | `WeaponSpInkStorm` | Cloud damage radius 10.0; cloud following, per-tick damage application and area/paint mapping need comparison. |
| `booyahBomb` | Booyah Bomb | `WeaponSpNiceBall` | Armor 4700; damage/paint radii 12.6/13.5; paint span 6F. Auto charge rates Low/Mid/High .002/.006/.010 per frame; self .077; friend [.088,.044,.022,.011]. Expanding damage is a separate per-frame gameplay rule, not one-shot impact. |
| `ultraStamp` | Ultra Stamp | `WeaponSpUltraStamp` | Raw table exposes 40 swing blast and thrown 220/60 damage bands at 3.6/8, plus paint radius 5; community S3 table distinguishes 100 body-contact stamp hit, absent from that blast row. Cadence/contact hitbox and movement need comparison. |
| `killerWail` | Killer Wail 5.1 | `WeaponSpMicroLaser` | Laser damage raw 35 (=3.5) every 5F; charge 36F. Lock selection, aim, obstruction and damage conversion need comparison. |
| `inkVac` | Ink Vac | `WeaponSpBlower` | Full-charge blast 220 at 11.0, min-charge 220 at 6.0; exhale direct 220; suction/charge and shot mapping need comparison. |
| `crabTank` | Crab Tank | `WeaponSpChariot` | Cannon direct 50 and blast 30 at 4.8; armor 5000 raw (=500); `CannonNoShotFrame=32`. Vehicle steering, mode transitions and explosion mapping need comparison. |
| `reefslider` | Reefslider | `WeaponSpSkewer` | Blast 220/70 at 9.0/14.9; pre-burst/move frames 38/54F. Travel path, collision timing and elevation handling need comparison. |
| `tripleInkstrike` | Triple Inkstrike | `WeaponSpTripleTornado` | Radius 7.7, paint radius 7.0, spread 50F, special total 360F; source `DamageValueStart/End=75` is a raw table field, while the public S3 damage reference is 37.5 every 5F. Marker flight and repeated damage/paint timing need comparison. |
| `tacticooler` | Tacticooler | `WeaponSpEnergyStand` | Put frame 900F (450F on tower), serve radius 7, special reduction 600F; pickup/effect timing and gear application need comparison. |
| `superChump` | Super Chump | `WeaponSpFirework` | Decoy blast 70/35 at 3.6/6.0; flight 108F, burst 210F, special total 635F. Count/spread and target-facing behavior need comparison. |
| `krakenRoyale` | Kraken Royale | `WeaponSpCastle` | Duration tiers 480/540/600F; charge/dash 35F each; jump raw damage 600 (=60); network-delay fields 60/30F. Community reference gives charge 120 and one-second activation/end vulnerability (half-second on other players' screens); hit/contact windows still need comparison. |
| `splattercolorScreen` | Splattercolor Screen | `WeaponSpChimney` | Wall startup/running/closing 60/560/60F, `SaturationFrame=360`, fade-out 120F, mark 120F, touch damage raw 400 (=40). Do not assume the saturation timer equals screen lifetime. |
| `waveBreaker` | Wave Breaker | `WeaponSpShockSonar` | Hit damage raw 300 (=30) at 0.5s interval; 4800 HP raw (=480); waves at 90/240/390F; mark 45F. Wave height/mark registration and painting need comparison. |
| `tripleSplashdown` | Triple Splashdown | `WeaponSpPogo` | Blast 220/60 at 6.4/9.6; rise 60F; `Rise_NoDamageStartFrame=50` and `StartInvincibleFrame=55`. Placement/overlap hitboxes, ground contact and burst order need comparison. |

## Source facts and calibration limits

The parameter JSON is the authority for the recorded 11.3.0 table fields. Raw damage is commonly stored in tenths (`400` means `40.0`); frame fields are game frames at 60 Hz; raw distances/radii are engine-space values. The scale into INKWAVE world units, collision-volume centers, terrain/height clipping, update ordering, paint coverage and presentation timing are implementation mappings and are not validated merely because the raw number was copied. A table value such as `DamageValueForDamageTag` is not automatically a player-damage event.

Splat Bomb and Suction Bomb each have a public 70% ink-cost value, but the two individual 11.3.0 parameter tables expose only the 60F recovery stop, not an `InkConsume` property; see [Inkipedia's Splat Bomb](https://splatoonwiki.org/wiki/Splat_Bomb) and [Suction Bomb](https://splatoonwiki.org/wiki/Suction_Bomb) references for that gameplay value. Other sub cost percentages above come from the corresponding extracted `WeaponParam.InkConsume` fields.

For the ambiguous behaviors below, use the separate public-mechanics reference and retain the distinction from extracted values:

* **Booyah Bomb:** The 11.3.0 table has `ArmorHP=4700` (470 HP after the usual ×10 damage scale), `DamageRadiusEnd=12.6`, `PaintRadiusEnd=13.5`, `PaintSpanFrame=6`, auto-charge Low/Mid/High `.002/.006/.010`, self `.077`, and friend `[.088,.044,.022,.011]`. Inkipedia's gameplay notes say the charging shield is 470 HP, the bomb does no damage at landing and begins expanding/damaging about 40F later; its S3 damage is listed as 3.3 per frame. The player and teammates charge it with Booyah calls (the wiki describes self +.07 and up to five ally contributions `.08/.04/.02/.01/.01`, plus ally-gauge credit). The table has no one-shot impact damage value, so do not model impact as a fixed 100-damage hit. Source: [Inkipedia Booyah Bomb](https://splatoonwiki.org/wiki/Booyah_bomb), particularly the S3 data and shield/charge notes.
* **Ultra Stamp:** The raw throw blast is `2200/600` (=220/60) at radii `3.6/8.0`; swing blast is raw `400` (=40). Inkipedia's S3 table distinguishes stamp direct hit 100, stamp splash 40, thrown direct hit 220 and throw splash 220/60. Thus `DirectDamageValue=2200` is for the thrown stamp, not the ordinary body-contact stamping attack. The 11.1.0 Nintendo notes also reduce the 220-damage thrown explosion radius from 4 to 3.6. Source: [Inkipedia Ultra Stamp](https://splatoonwiki.org/wiki/Ultra_Stamp); [Nintendo update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/~/how-to-update-splatoon-3).
* **Splattercolor Screen:** `SaturationFrame=360` is the source parameter name; it should not be presented as a proven total debuff duration. The wall's explicit 60/560/60F lifecycle and 120F mark are separate entries.
* **Triple Inkstrike:** The source has ending `DamageValue=75`, while the public gameplay table lists 37.5 every 5F; the raw field's damage cadence/actor-hit conversion needs a comparison before using it as the applied damage.
* **Kraken Royale:** The 8.1.0 Nintendo notes confirm full charge for the charge attack increased from 30 to 35F; the current table has 35F charge plus 35F movement, and raw jump hit damage 60. Inkipedia describes charge hit damage as 120 and a one-second vulnerable period at activation and end on the user's screen (half a second on other players' screens). Raw `StartDelayFrame_NetSend=60` and `StartDelayFrame_NetRecv=30` are network-delay fields and should not silently be treated as those gameplay windows. Source: [Nintendo update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history); [Inkipedia Kraken Royale](https://splatoonwiki.org/wiki/Kraken_Royale).

These references establish source attribution and the limits of the extracted numbers. They do not establish full frame-for-frame parity. Remaining work that requires game comparison is called out above per family, especially geometry and input/target behavior; no such comparison is represented as completed by this receipt.


Ink Mine has no natural expiry in S3, is activated by enemy ink, and detonates the oldest mine when a third is placed. This behavior follows [Inkipedia Ink Mine](https://splatoonwiki.org/wiki/Ink_Mine) (S3 duration and the S2 4.0 replacement rule retained in S3). The enemy-ink territory sample uses a calibrated 0.45 world-unit radius; that radius is not a field in the extracted table.
