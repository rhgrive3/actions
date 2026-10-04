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
life metadata cannot authorize damage to a new life. Owner ticks carry a named
`l` dictionary keyed by actor id; the existing actor tuple remains intact.
This avoids draft PR #328's special-use counter at tuple slot 21. Monotonic hit
sequence numbers and ordered tick admission reject repeated transactions.

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

Focused final integration: 21 combat tests passed against both the complete
source-adapter chain and the actual built/minified module graph. These execute
native Actor, Projectiles.applyHit, NetMatch packing, sender admission, sampling
and event playback in paired owner realms. Known paint-area stubs isolate the
scoring assertion; this is deterministic wire replay, not a live-relay latency
measurement. Coverage includes held old-life/dead hits, matching new-life hits,
sampled versus buffered life, native host adoption, duplicate hits/ticks/events,
malformed attribution, reversed ownership, special suppression, environmental
and nonlethal deaths, offline parity, identical burst paint, and remote scorer
convergence at the existing integer snapshot precision.

Local quality: 11 tests passed, including three new landing tests. Real Character
checks cover all seven weapon rigs, soft/hard landings and 30/60/120 Hz (42
combinations). World weapon basis lengths and Gram matrices remain rigid; the
old-source negative control detects the deformation. Articulated pelvis and
kid-space knees, native landing timing and other action springs remain covered.
These CPU transform checks complement the existing rendered browser gates.

Independent adversarial review used Freebuff 6/7/8 and Cline 7/8/9, each in a
separate worktree/tmux lane. The parent reproduced and fixed duplicate hit
application and the PR #328 tuple collision, corrected two initially vacuous
owner-snapshot tests, and verified the integrated lane tests. Completed read-only
network and visual reviews found no remaining blocker in their reviewed scope.

Live audit refreshed all 40 open/draft PRs after new batch PRs #441 and #442
appeared and PR #401 advanced; their actual changed files/diffs fix different
roots. The target issues remain open and unaddressed outside C. PR #182/400
adapter anchors and syntax compose in the intended gameplay-before-reliability
order. PR #400 in reverse order remains unsupported, as its one-shot anchors
expect native hit signatures. PR #328 snapshot counter fragments compose in
both orders after using named life metadata. Actual PR #183's Practice Range
adapter leaves the five affected core modules unchanged. This is an anchor and
syntax audit of future branches, not their combined runtime acceptance.

The current main does not include Practice Range; that feature remains in
#183/#339. No range tuning or battle-state feature is added here. Normal/offline
behavior has deterministic coverage; full future-range runtime acceptance is
outside this batch. Network peers must use this updated combat metadata; no
mixed-old-build or Nintendo-protocol compatibility is claimed. Existing
non-landing jump/dodge/slam squash remains unchanged.

Baseline CI: [37200951785](https://github.com/rhgrive3/actions/actions/runs/37200951785)
passed at baseline main. Preliminary exact-SHA validation of the initial batch,
[37213004122](https://github.com/rhgrive3/actions/actions/runs/37213004122), passed
all four existing validate/active/catalog/Chromium-WebKit UI jobs. This earlier
run is not final-head evidence. Final immutable-head CI and validated artifact
receipts are linked from the batch PR; existing workflow gates remain unchanged.

Durable parent evidence, lane briefs, roster and checkpoints are retained at
`/mnt/workspace/inkwave-batch-c/`. The batch is prepared for review without merge
or deployment.
