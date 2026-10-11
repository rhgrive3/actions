# Weapon-class state continuity against PR #1202

Baseline: `7d74919cf78dd203e7bd0d1b80eeaf451eaec0f8`, public
`inkwave-public/` with its S3 build adapters and bootstrap installers.
This batch has **four reachable behavior cases, across three root causes**.
The extra Splatling/Ink Vac combination is integration hardening, **not a fifth
retail-kit discrepancy**. No raw archive members or decompiled code are included.

## Source scope and units

The supplied [public sources part 02 archive](https://drive.google.com/file/d/17DwQhUw8MPASjNQ3TQn3k_EIB6igrfxW/view)
contains extracted parameter JSON, not the corresponding executable gameplay
consumers. The inspected snapshot is Splatoon 3 **11.3.0**, Leanny/splat3
`7280ff9cde8bb1c5dcef46c700c326471584d2e6`, under
`data/parameter/1130/weapon/`. These are standard non-Coop files:

| Member | SHA-256 | Relevant source values |
| --- | --- | --- |
| WeaponChargerNormal.game__GameParameterTable.json | dfe4637def507f933b0bbecbc805331f6357bb69ac165608a6e558406a4b72c1 | minimum/full ink .0225/.18; KeepChargeFullFrame 75 |
| WeaponRollerNormal.game__GameParameterTable.json | 5b423eb35d4cac268a1e4085ec8321d27639ddbfc8f3775bb65696af5c2449c7 | wide SwingFrame 21, InkConsume .085, InkRecoverStop 43; vertical recovery 58 |
| WeaponSlosherStrong.game__GameParameterTable.json | 1d20043ad7efaf2831801afbce601fb1e14bfd11947063903c6fadd6c98f5298 | SwingLiftFrame 12, RepeatFrame 29, InkConsume .076, InkRecoverStop 40 |
| WeaponSpinnerStandard.game__GameParameterTable.json | 92647d586beee1764ca8984820fa37e0fd7887e2a756f7ca18e10e1aef97fd08 | charge 48/72F, stream 80/160F, RepeatFrame 4, PostDelayFrame 4, InkConsume .225 |

Frames use the existing authoritative 60Hz convention; runtime timers are
seconds. InkConsume fractions multiply by 100 to become tank units. No distance,
velocity, damage, profile, or source interpolation values are changed.

The [Charger verification page](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%81%E3%83%A3%E3%83%BC%E3%82%B8%E3%83%A3%E3%83%BC%E5%B1%9E#charge)
explicitly states that holding full charge does not consume or recover ink.
This is community behavioral verification, not a predicate proven by the sparse
JSON or a fresh hardware measurement. The extracted data alone does not establish
all charge/refund/interruption semantics; those limitations remain open.

## Cases repaired

### 1. Full Charger hold refills a paid tank (#1204)

`resources.mjs` admitted `chargerLowRecovery` whenever charging remained true and
remaining ink was below the minimum 2.25-unit cost. A real 18-unit start reaches
full charge with `s3ChargerSpent=18`, but its held full state could continue
refilling the remaining tank up to approximately 2.33 units. The full charge is
created through actual admission, not injected by the test.

The strict existing `isChargerFullCharge` predicate now excludes that full-held
state. Partial/empty charging policy is deliberately unchanged. In particular,
this narrow fix does **not** claim that all low-ink recovery or cancellation
refund semantics match retail. No negative-tank bug is claimed.

[Issue #1204](https://github.com/rhgrive3/actions/issues/1204) was opened after
checking duplicates. Old #178 targeted the removed `game/` prototype and is not
reused or reopened.

### 2. Low-ink first-step correction leaves the full-completion clock ahead (#1038 residual)

The installed hotfix corrects the first native charge/payment step to the
existing insufficient-ink multiplier. It rewinds chargeT but formerly left
`s3ChargerElapsed` at the original unscaled elapsed time. At 60Hz and the current
1/3 rate, progress records 1/180 seconds while the completion owner records
1/60 seconds. Those two clocks could disagree before the full-only promotion.

The same correction now updates elapsed seconds and clears its obsolete
compensation. Real startup and physical held-input time remain unchanged. Tests
cover 2.25, 10, and 17.99 tank units and the subsequent progress history. This
repairs internal ownership of the already-accepted rate; it does not add a new
claim about the retail middle charge-cost curve.

### 3. Slosher windup survives a committed Special (#196 related audit)

The actual Slosher kit is explicitly labeled **original INKWAVE kit**, with Slam.
After ten ticks of main admission, its sourced 12F heave is still pending.
Activating Slam formerly froze the pending Slosher clock, then resumed it after
the Special despite ZR being released. A successful Special now retires the
pending main action through the existing cancellation owner. The test runs the
real Special to completion and another 60F, with no stale Slosher emission.

This is a public-game action-lifecycle defect against the established #196
interruption contract, not a claim that Slosher+Slam is a verified S3 kit.

### 4. Roller flick survives Big Bubbler deployment (#196 related audit)

The actual verified Splat Roller kit uses Big Bubbler. A pending horizontal
flick remained active across deployment; the deployment does not need a
body-owning `specialActive` interval, so an `activeBefore -> activeAfter` test
cannot own this interruption reliably. The committed `special:use` event does.
The pending flick and lowered rolling presentation are retired without resetting
cooldown, ink already spent, or hit history. The test uses the actual equipped
Bubbler kit and confirms no stale flick after the deployment.

### Additional integration hardening: Splatling + a bypassing kit

Splatling's cancellation was previously attached directly to native
`Actor._startSpecial`. Ink Vac emits the committed activation event but bypasses
that native function. A synthetic Splatling+Ink Vac combination therefore kept
its charge or prepaid stream. The Splatling cancellation now uses the same
committed event through its existing prepaid-reservation owner. Rejected kit
activation preserves charge. The Special refill remains capped at 100 and no
unused rounds revive.

This combination is **not** the current Splatling loadout and is not counted as
a current retail-kit discrepancy. It is a composition guard for the same
lifecycle repair, not permission to change kit assignments.

## Preserved owners and controls

- The existing #196 Charger installer already cancels the ordinary Charger/Ink
  Vac case. It remains unchanged and is tested as a passing baseline control.
- The existing #1089 Dualies activation listener is unchanged.
- The new event listener handles Slosher, Roller and Splatling only; remote
  notifications cannot cancel another authoritative actor.
- Cancellation does not call reset(), grant a new cooldown, or erase hit history.
- The public profile and extracted source numbers remain unchanged.
- No class damage, ballistic, paint, movement, kit, or network protocol edits.

## Validation

`weapon-class-state-continuity.test.mjs` uses the real public modules, all six
production adapters and the exact ordered bootstrap installers. It runs native
Special state machines; graphics, audio and terrain contact are headless fixture
substitutes. The tests distinguish the actual retail/INKWAVE loadout cases from
the synthetic Splatling combination.

- Baseline: six failing assertions across the four reachable cases and synthetic
  Splatling cases; Charger/Ink Vac, rejected activation and remote controls pass.
- Patched focused suite: **10/10 passed**.
- Fixed 60Hz authority agrees under **30/60/120Hz rendering**.
- Adjacent regression and quick compatibility receipts are recorded in the
  integration handoff; a focused pass is not an aggregate CI claim.

No browser/GPU capture or new Switch comparison was run. Retail charge-cost
interpolation, low-ink progression/refill semantics, and exact cancellation refund
semantics are not marked resolved by this batch.
