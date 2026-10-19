# Legacy scoped Charger composition and admission

Base: 9af3006e5a5b176f480d2ec6947cfce64a182ef1. Reconciles the19 changed paths of PR1603 (13f57387a0b579a1d894f0bc6c8db7f02f4abd88) without modifying that branch. Current camera ownership/default28 degrees and newer nearest-splash test are preserved. Original PR1603 local paint scale assumptions remain separate unverified fidelity limits.

## Reproduced defects
The new legacy charger_scope bypasses profile.weapons.charger application. Its absent inkMin causes nonfinite charging and absent damagePartialMax causes nonfinite partial damage. After restoring those endpoints, ordinary full Fire→Squid also creates a stored charge with NaN remaining because legacy storage does not exclude scopes and the scoped record intentionally has no keep lifetime.

## Bounded correction
Read only the pinned scoped record's InkConsumeMinCharge=.0225 and ValueMaxCharge=800, using established tank×100 and damage/10 conversions. Bridge WeaponScopeParam presence to scopedCharge. Exclude scoped weapons before legacy stored state creation. Preserve original IDs, models, optics, storm180 kit, paint owner, range, movement, clocks and all existing fields. No wholesale alias to a different catalogue weapon.

Source: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponChargerNormalScope.game__GameParameterTable.json

## Evidence and remaining gates
- Actual composed Actor30/60/120Hz partial/full input, finite charge/damage/ink, one native release call, scope no-keep, ordinary Charger keep and catalogue scope controls.
- Dedicated isolated7/7, existing keep/damage/camera39/39; original-runtime negative4 fail/3 controls.
- Independent registry comparison162records preserves all existing fields except the intended3 additions on newscope; optics972checks, paint8comparisons and normal335tick lifecycle unchanged.
- Publishable source regression6/6. Exact proposed browser block executes in the composed fixture1/1 with cleanup and helper-boundary preservation.
- Current161f splash runtime overlay passes7/7. New main splash hunk and PR1636 keep hunks commute byte-for-byte in a separate composition check.
- Workflow adds the dedicated source and emitted regression to the existing seven_claims job. Existing Chromium/WebKit catalog runner records the new partial/full release,28-degree optical settings and scope no-keep checks.

Native browser execution, actual rendered optical/model appearance, emitted execution and complete final-head CI remain pending. This is not a claim of exact retail paint scale or full PR visual acceptance.

## Latest-main paint ownership integration

The original PR1603 finite-flight floor beads land after release. On main9ad, an older wall regression incorrectly assumed the entire floor credit was already present at release. A three-layer comparison (main alone, original1603, minimal scope repair) isolates this timing assumption; the two PR variants have identical emissions. The revised regression preserves zero wall credit, checks four actual delayed floor contacts and submitted source-mask quads, and derives ledger growth from new eligible floor cells. Injected wall credit and suppressed floor credit both fail. This is a test-only correction; no paint runtime or numeric endpoint was adjusted. Actual shader acceptance on the final composed build remains pending.
