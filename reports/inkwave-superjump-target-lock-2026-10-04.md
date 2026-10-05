# Super Jump destination commitment (#362)

## Scope and dependency

This is a narrow follow-up on PR #301 at `ce64c0297038260eecd5a9628324969616bd973d`. That PR owns support, ground-history resolution and flight actions. This change resolves its existing ground-history target at successful selection, initializes `superJumpState.to` immediately, and never follows the teammate again. It does not retune charge, flight, damage, movement or landing trajectories. Raw public source and upstream locks remain unchanged.

## Reference and limits

Splatoon 3 baseline is Ver. 11.3.0. The [Gamepur hands-on Super Jump guide](https://www.gamepur.com/guides/how-to-super-jump-in-splatoon-3) describes committing the teammate's location when selecting: their later movement or splat does not redirect the jumper. This September 2022 gameplay guide is secondary behavior evidence, not an official Nintendo numerical specification or new current-version hardware measurement. The [Super Jump overview](https://splatoonwiki.org/wiki/Super_Jump) was unavailable during this pass; it is not claimed newly verified. Physical Nintendo/mobile comparison remains pending.

## Before and after

Previously, PR #301 waited for charge completion to resolve the teammate's current last-ground point. Moving to a new grounded location changed the destination; death cleared that point and cancelled the jumper. Now eligibility and known grounded location are checked before any charge state, animation, audio or event starts. The destination is cloned into the admitted jump. Its flight event, landing marker and trajectory use the same committed vector. Fixed spawn coordinates are cloned too. Invalid, dead, enemy, self, currently jumping, or unsupported targets are rejected. A jump cancelled by the jumper's own death stays cancelled.

Moving platforms and unsupported/newly airborne peers keep #301's existing conservative policy. No new platform attachment or physical distance calibration is inferred.

## Verification

Source and emitted/minified tests cover the full native Actor, Physics, Character, fixed clock and production adapter chain. Results will be recorded on the PR after completion. Full GPU/browser verification is separate and must not be inferred from these tests.

Completed local evidence: six new source cases pass; all 18 source-equivalent emitted/minified cases pass, including the 12 existing support/flight/action regressions. Baseline #301 fails all six new cases. The first candidate run exposed exact-zero fixture expectations against a native ground result of about -5.55e-17; the final fixture checks spatial proximity within 1e-9 while retaining exact equality of the committed coordinates throughout each jump. Authentic build `612bf7209595`, upstream/reference quick checks and whitespace checks pass. Aggregate and remote CI are tracked separately on the PR.
