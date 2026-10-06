# Fixed normal issue set after source-PR recovery

Base: 8246e178831e49a8ec912b2bcd1682236993036c. This set is independent of the eleven-source recovery inventory.

| Issue | Adopted scope | Evidence / limits |
| --- | --- | --- |
| 852 | Pen obtains the same existing touch capture path | 24 prior source cases; shared current input boundaries below |
| 832 | Camera Y inversion no longer reverses movement stick Y | 6 prior source cases; camera/profile/gyro preserved |
| 870 | Partial Charger shots stop on allied bodies, full piercing retained | 7 source cases; current position-only hitbase retained |
| 856 | Super Jump flight advances existing HP recovery | 8 source + actual charge boundary; existing 12.5 rate retained, external 12.6 calibration unresolved; Refs only |
| 839 | Roller contact interval uses 24 simulation frames | 12 cadence/admission cases; v10 table and later-version continuity limitation retained; Refs only |
| 881 | Roller ink-recovery delay starts at actual release | 22 source cases; accepted-jump fixture composes with natural-fall classification |
| 837 | Charger sub admission shares the existing postshot clock | 11 source cases; 15-frame admission and existing ready timer remain separate |

The latest composition reran nine weapon boundaries and four input boundaries, all passed. Original deeper case receipts remain with each issue report. One emitted build (esbuild 0.28.2) passed 292 source transformations, unchanged 145-hint startup budget, canonical 15 weapon cases / 3 network modes / 4 wall families / 6 wall cases. Content hash: 9851e4b23ea3db19374cf348c4d0053c3e91955c93993c90835a23f74b556724. Full CI and physical browser/device acceptance remain pending. No main merge or issue closure is part of this publication.

Start comments: 852/6023453880, 832/6023578904, 870/6021875277, 856/6023594281, 837/6024339447; the issue-specific reports preserve the other provenance and calibration caveats.
