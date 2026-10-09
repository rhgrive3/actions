# Ink Storm full rain lifetime (#563)

Baseline: actual main fc057af9baac421ec707504f4637e2ed8824a444. Target is `inkwave-public` through the build adapter; upstream files are unchanged. Acceptance reference: Splatoon3 Ver.11.3.0, zero Special Power Up.

The pinned source [WeaponSpInkStorm](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json) has CloudParam.RainyFrame Low480/Mid540/High600. Main's existing Sub/Special fidelity owner supplies24HP/s and8s. This change introduces no DPS, radius, duration, or physical-distance tuning.

The native cloud incremented time before applying `c.t < c.dur - .3`, coupling rain gameplay to visual fading. Actual floating-point60Hz replay gives462 damaging ticks (184.8 rawHP) and retirement at481, rather than the issue body's idealized461-tick arithmetic. The build adapter now admits rain through the final reference tick and uses a small time-comparison epsilon for exact fixed-step retirement. The corrected base cloud damages on all480 ticks (192 rawHP), retires at480, and never deals damage at481. Visual fade/release and existing filters remain native.

Verification: dedicated source5/5 and actual production-minified5/5. The installed Sub/Special and network cloud wrappers are present. Tests cover461/462/479/480,480/540/600-frame duration endpoints, team/dead/remote/range/height/LOS rejection, ghost recipient-only damage/no remote paint, owner attribution, and30/60/120/144Hz renders driving the same60Hz clock. The192 figure is raw exposure measured with a non-dying damage recorder; it is not a claim that a100HP actor survives eight seconds.

This is the existing fixed60Hz simulation contract, not an arbitrary variable-dt integrator or a Switch/frame-capture measurement. Cloud overlap arbitration (#225), gear-duration interpolation, gauge drain, and healing remain separately owned. PR322 retains the old cutoff in its initial diff; its top-level adapter runs before these two connections, so its native cloud close anchor remains available, but its separate recovery helper still has an old cutoff and full future322/network composition is not claimed here.

No pending network publication file is changed, and no standalone CI or main merge is requested. The independent local patch goes to the integration batch.
