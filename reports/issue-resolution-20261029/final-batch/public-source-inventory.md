# Bounded archive/source inventory

No new native game-engine consumer for UnitDamageRate, bounce, ShotFailedInterval,
or the remaining #735/#226 source questions was established by this inspection.
This does not establish that every public source is unavailable or that these
issues are intrinsically unfixable.

The specified folder contains 19 standalone ZIPs totaling 1,252,908,662 bytes and
a separate Roller VTF folder. There is no direct README/index. Only part01
(66,726,450 bytes) was selected as an authorized file reference. HTTP206 ranges
read its complete central directory and five small text members: 430,023 bytes
in total. No full archive was stored locally, no other part was fetched, no
archive code was executed, and no production/shared code or GPU was touched.

`SOURCE_INFO.txt` identifies four public repository snapshots. Its SHA256 is
`d1097b077b152e725ac35a65d7901bf06b90b60426428f9dfdc132cd7c52642c`.
It declares that Git histories, external downloads and Splatoon3 game RomFS
are not included. The small reconstruction notice describes independent ZIPs
whose paths merge into one bundle; that instruction was inspected, not executed.

| Snapshot | Provenance and what was found |
|---|---|
| Dexx-io/Splatoon-Decomp, `9ef403d96f1a370bdd70434ce158a0c29879bfcf` | Pinned author README explicitly says original Splatoon1 material conversion. Complete nontruncated NTSC Splatoon/thick tree has 462 files, and every path/size matches part01. There are no C/C++ headers/source or other examined engine-code extensions in that subtree. It is not S3 11.3 gameplay-engine evidence. |
| Leanny/splat3, `7280ff9cde8bb1c5dcef46c700c326471584d2e6` | Public commit message `1130`, dated 2026-08-20. This is the same sourceCommit already pinned by the current profile. Version1130's complete weapon subtree contains 221 JSON parameter files. This is useful versioned parameter data, but provides no newly identified native field-consuming code. |
| nvnprogram/HoianViewer, `89f23684b9dede5da8207e5f9f1980150bec774a` | Commit dated 2026-09-29. Archived README's Git blob matches the pinned public README. It describes a standalone player/model/material/cloth viewer and requires separately supplied RomFS of the chosen version. Part01 contains 950 C# files, predominantly viewer/rendering/cloth code; no weapon/projectile/damage consumer was identified by the bounded filename/README inspection. This is not proof of fixed11.3 gameplay semantics. |
| DesperC/Awesome-Splatoon3-Hacking, `07b2888c04cc383a54b27b05edb62051868ebe03` | Commit dated 2025-05-29; archived README's Git blob matches the pinned public README. It is a parameter-modding tutorial. Its Decompile action refers to editing Params.pack parameter text, not to an identified native executable call path. No fixed11.3 engine semantics for the target fields were found. |

Public provenance links:

- https://github.com/Dexx-io/Splatoon-Decomp/blob/9ef403d96f1a370bdd70434ce158a0c29879bfcf/README.md
- https://github.com/Leanny/splat3/commit/7280ff9cde8bb1c5dcef46c700c326471584d2e6
- https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/README.md
- https://github.com/DesperC/Awesome-Splatoon3-Hacking/blob/07b2888c04cc383a54b27b05edb62051868ebe03/README.md

The other18 ZIP byte contents remain uninspected. SOURCE_INFO is a provenance
declaration rather than a byte-level proof that no unlisted files occur there.
The complete pinned public thick and1130 weapon metadata provide additional
bounded coverage without downloading the archive collection. Current evidence
does not supply the missing game-engine call-site/phase interpretation, and no
existing acceptance threshold or issue disposition was changed.

`summary.json`, the range receipts, selected texts and public pinned metadata
remain in this scratch directory. Raw folder inventory contains private Drive
identifiers and must remain local; do not publish the raw directory or game
assets. This findings document contains public provenance links and counts only.
