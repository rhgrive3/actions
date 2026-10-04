# INKWAVE batch C: combat life, remote kill credit and landing rigidity

Development baseline: `rhgrive3/actions` main
`17602ab094da6efb663d872934458e818ae3c93e`.

Scope: the published `inkwave-public/` build and its existing patch adapters.
The unrelated `Game`/INKGORGE prototype is excluded. Upstream fetched source,
weapon balance and collision parameters remain owned by their existing layers.

## Issue and overlap audit

The parent acquired atomic shared claims for #394, #379 and #90 as owner C.
The initial audit fetched 223 open issues and all 38 open/draft PRs, including
their actual diffs, head commits and branch names. Missing issue links were
never accepted as proof that an issue remains unfixed.

- #394: `sendHit` carries stable victim `nid` without its combat life.
  `_hit` admits a delayed old-life hit after respawn and protection expiry.
  PR #182 and its draft integration #337 improve projectile/event replication
  but do not add victim-life validation. PR #400 carries attack-local clothing
  equipment; it does not bind a hit to the victim's life.
- #379: victim-owner `Actor.splat` credits the remote attacker proxy for the
  death-burst paint. The scorer owner only receives a splat-count confirmation.
  Repainting to calculate the missing credit would change world paint and can
  return zero after replication. The existing network PRs do not transfer the
  original claimed area to the authoritative scorer.
- #90: native `land` injects the shared whole-hierarchy squash spring, scaling
  rigid equipment along with the body. The existing articulated landing layer
  adds knee/pelvis movement but leaves this scale impulse intact. Actual open
  motion PR diffs do not remove that landing impulse.

Practice Range is already implemented in PR #183 and its combined acceptance
PR #339. C does not duplicate that feature. Other overlapping weapon, gear,
motion, input and resource fixes were excluded. Final live overlap and main
reconciliation evidence is recorded with the final verification below.

## Design and invariants

Combat-life identity is separate from the existing teleport/interpolation
counter: a Super Jump or an ownership handoff must not become a new combat
life. Only the victim owner applies admitted gameplay hits. Missing or stale
life metadata cannot authorize damage to a new life.

Death-burst scoring must retain the exact area returned by the original paint
operation, credit the owning scorer once, and leave paint playback independent
of that credit. A snapshot that already marks a victim dead must not erase the
pending legitimate scorer reward. Duplicate terminal events must neither award
again nor splat a respawned actor.

The landing correction belongs to presentation. Articulated impact springs and
the existing landing clock remain; the landing-specific impulse that stretches
the whole body/weapon hierarchy is removed. Movement, collision, damage,
weapon timing and ink distribution are not retuned.

These combat defects are INKWAVE authority-consistency defects. No claim is
made about Nintendo's private network protocol or measured Switch netcode.
The landing change fixes rigid-shape preservation, not an experimentally
calibrated Splatoon 3 joint trajectory. Existing Splatoon 3 11.3.0 numerical
provenance and unverified calibration entries remain unchanged.

## Verification

Baseline CI: [37200951785](https://github.com/rhgrive3/actions/actions/runs/37200951785)
passed at the exact baseline main SHA. Focused lane tests, combined source and
emitted build tests, independent adversarial review, final live overlap audit,
and exact-head Actions results are recorded here after completion.

Durable parent evidence, lane briefs, roster and checkpoints are retained at
`/mnt/workspace/inkwave-batch-c/`. No merge or deployment is authorized.
