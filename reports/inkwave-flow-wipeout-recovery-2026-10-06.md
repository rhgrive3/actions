# Restore the offline WIPEOUT Flow consumer (#505)

Source: PR536 commit a9e661824adfacd15ec926c5c15744fa93182835, also present byte-for-byte at41d6d9b99c2aca6ca6137fd6c18fb9ee905f687c.
Target: PR868 commit327651d26bfbd63d2f867e1205b14aa88e339948.

The active CI37516629239 / job112451070634 stopped at `WIPEOUT Flow team award missing or repeated`. The later merge retained the Match/HUD event but lost the original Flow consumer and profile.flow.progress.wipeoutBonus=10. This restores those source hunks, with the later200fp Turf storage cap applied to the new progress award. Existing dead-state decay, respawn preservation, authoritative assists, #427 and #481 owners remain intact. All previous509 numeric entries remain equal; the original bonus adds exactly one indexed field.

Scope remains offline ordinary4v4 Turf only. Sequence/Match/lifecycle guards, repeated-install idempotence, dead teammates, active Flow exclusion and progress-only activation rules follow the source. Online awards remain explicitly excluded pending authoritative team-event transport. No physical Switch or new browser execution is claimed.

Verification: original8 native Actor/Match/bus cases pass; current cap plus the exact active-probe actor/Match transition add2 passing cases. The uncorrected current Flow fails that probe0fp versus10. Existing #427 current-owner6 cases pass. The full current source transformation retains all relevant owners. Existing #768 storage tests have3pass/5fail caused by old fixed .003 turf expectations against current .0024; the same5 failures reproduce with unmodified Flow and are separate from this runtime repair.
