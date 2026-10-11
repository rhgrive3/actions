# First-result transactional admission (#1206, additional fourth root)

After the three disconnect residuals, review found a separate first-result admission defect. Native `_result` mutates optional special counts, then actor stats, then commits the result. A malformed common header can lock an invalid result as the first accepted result; an invalid later stat row throws after earlier stats have already changed. Validating duplicate delivery alone cannot protect the initial commit.

`validResultPacket` now validates common coverage (two finite ratios in [0,1]), winner (0 or 1), known mode (including absent legacy Turf mode), and known legacy stat fields before any effect. Optional missing stat table and optional missing boss damage/weak hits/assists remain supported. Unknown appended stat fields are not constrained. Optional specialCounts still follows its existing tolerant per-entry logic. No counter cap or new retail constant is introduced. Equal coverage still uses the authoritative host's winner; the receiver does not reroll the tie.

This is abnormal-payload robustness. Ordinary native sender outputs are retained and round-trip tested. It is not a claim that normal senders emit malformed data, a security proof for all boss-specific object fields, or an extracted Nintendo networking protocol.

The source scope remains the pinned 1130 manual mapping and USen localization documented in #1203 and `pr1202-disconnect-terminal-residual-1206.md`; those support finite scores and post-battle results at the game-rule level. No applicable decompiled executable was located and no raw bundle is published.

Production edits: network adapter result precondition plus one import; a new pure result-admission module. This is separate from the sibling kit paint ledger hunks. The original PR1202 branch and main are unchanged.

Verification: 14 dedicated tests plus 13 existing terminal integrity tests pass (27/27). Candidate adapter is exercised with the actual production composition and native sender, with deterministic platform/scene fixtures. No browser or real relay test is claimed.
Baseline uses the same 14 dedicated tests against the integrated code without the new result guard: 9 malformed-payload/atomicity cases fail and all 5 normal-compatibility controls pass. Candidate passes all 14.
