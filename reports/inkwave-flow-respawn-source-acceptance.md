# Flow and respawn source acceptance repair

Base868ac1a87c0. This fixed set covers the seven assigned source-test files only; it is separate from the assist-life protocol change.

One actual runtime connection was missing: remote native respawn does not call Actor.reset, so the movement runtime's previous-life actions/roll/surge remained on a proxy. Movement's existing reset cleanup is factored into one private helper and invoked after the native NetMatch remote-respawn owner completes. The prior state is retired without replacing native network, armor, auth, position or lifecycle processing. The original missing-connection negative executes native splat/respawn and retains the old charged Surge; the corrected case clears it.

Fixture repairs follow current contracts: actor ticks complete deferred lethal decisions; actual roll admission creates armor; Shooter first-shot delay precedes consumption; positive Flow turf gain resets idle time while configured zero damage does not; active Flow survives death and its movement effect is compared in the same grounded state; current extension and roll history are profile-owned. Respawn uses actual Quick Respawn history, final actor countdown, current22-slot packet with special counter, and legal fresh Shooter startup.

The old405 native model remains an explicit negative control. Current acceptance uses the profile's shared ground vector acceleration and preserves exact equal neutral/reverse rates, vector changes, isolation and the independent air rate. It does not restore retired58/78 or carving behavior to production.

Affected six-file run:56 pass/1 stale armor fixture; corrected actual-armor case1pass. Current405 cases7pass; explicit remote missing-connection negative1pass. All65 unique affected cases have passing evidence. No aggregate rerun, build, browser or hardware acceptance is claimed.
