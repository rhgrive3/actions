# Mist query cost, 2026-10-12

The complete 1263 head30ecd07e62ba5e5e1c07adcb16aa6f398f029082 passed its hosted gates, but independent review identified additional repeated line-of-sight (LOS) work. This report retains that finding rather than treating behavioral success as performance proof.

## Measurement

Reproducible Node/VM benchmark: scripts/bench-inkwave-mist-query.mjs [checkout]. Eight real composed Actors run grounded human `_horizontal` and real Projectiles.update at60Hz. Real Physics/Level LOS is counted. Five alternating process runs per version,100 warm-up frames and1000 measured frames. The96-object cases are synthetic bounded stress populations, not a claim that96 simultaneous legitimate Mist throws occur in normal play. Time is Node wall time, not browser GPU/frame cost.

Median milliseconds per tick / LOS count:

| Population | main90b4 | initial1263 | optimized |
|---|---:|---:|---:|
| empty | .03077 /0 | .03921 /0 | .03680 /0 |
|96 non-Mist | .02432 /0 | .07835 /0 | .05836 /0 |
|1 Mist | .03556 /8 | .05771 /32 | .04664 /24 |
|96 overlapping Mist | .63582 /768 |1.47798 /3072 | .66116 /784 |
|95 non-Mist +1 Mist | .03210 /8 | .09404 /32 | .06489 /24 |

The optimization removes most pathological overlap cost but does not erase the extra cost of accurate live membership. Single-cloud and non-Mist populations remain slower than the prior lease-based implementation. No browser timing claim is made.

## Narrow uncached changes

1. Once a currently visible cloud establishes a minimum slowdown, equal or weaker cloud values cannot change that query's result; skip their LOS. A stronger later cloud is still evaluated. Blocked strong clouds do not suppress visible weaker clouds.
2. Ordinary grounded human movement already obtains the multiplier in WeaponRunner.moveSpeed, so omit its otherwise unused extra query. Enemy-ink and humanoid airborne caps retain the needed query. Airborne squid has no Mist speed cap and therefore skips its unused query.

There is no tick, position, gear, LOS or membership cache. Every subsequent query reads current life/team/position/cloud expiry/gear and current LOS. Existing expiry, form transitions, damage and raw source coefficients remain unchanged.

## Verification

Five added cases include96 equal clouds, stronger/blocked cloud ordering, same-time gear/position/death changes, no-Mist LOS0, movement query counts, and500 seeded96-volume comparisons against the previous full-scan oracle. Existing Mist and browser-probe source tests pass. Initial actual production-built23/23 pass. The actual Chromium/WebKit probe now records one LOS for ordinary human movement in1 and96 equal clouds, and zero for unused airborne squid lookup; final hosted proof remains pending until the new head runs.

This does not resolve calibrated base movement, absolute Mist radius/drain/lifetime or all retail physical fidelity.
