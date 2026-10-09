# PR868: restore the retained Roller owner connection

Fixed source: f97cebd47eaca39bc57da44bb110d3e1569aa3c6.
Source PR: #818 (7b891be1e78c9be023397227fa7a35a6fd4f1570), including #794 / #626.

The integration retained calls to the roll-stop helpers but omitted their declarations, Actor/G installer parameters and the captured original runner update. Installing the fetched PR868 Roller module in the accepted PR818 native fixture fails with ReferenceError: Actor is not defined.

This patch restores four missing source sections through three narrow diff hunks. Other bytes of the fetched module were checked unchanged. It restores deadline helper exports, installer context/update capture, main819 squid-origin input tracking/reset, and existing windup handoff/attack-mode snapshot. The resulting module matches the retained PR818 module.

Validation: one negative installation using the unmodified PR868 module; after the hunk repair, all 13 existing #626 cases passed with zero failures/skips. Fixture context is accepted PR818 at 7b891be1; this is not a successful full PR868 build or CI. Camera shoulder/initial wall clearance, #724 reticle and #715 visibility blocks were separately read and retained in PR868.

Original blob: d4ba1955050bac5919bbb999bf38d6b64c332f9b.
Corrected blob: 7e11e8415d7c6620458fc9c95dd91b776aeaead5.

No source owner branch or main was changed by this handoff. No new PR or duplicate CI is needed merely to deliver the patch.
